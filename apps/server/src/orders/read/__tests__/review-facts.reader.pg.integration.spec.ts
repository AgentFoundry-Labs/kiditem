import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import { readCurrentReviewItems } from '../review-facts.reader';
import { ReviewsService } from '../../services/reviews.service';
import type { PrismaClient } from '@prisma/client';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelListingQueryService } from '../../../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelOptionRecipeService } from '../../../channels/application/service/listing/channel-option-recipe.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelAccountService } from '../../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../../channels/adapter/out/credentials/channel-credentials.adapter';

const ACCOUNT_ID = '73000000-0000-4000-8000-000000000001';
const SOURCE_ACCOUNT_ID = '73000000-0000-4000-8000-000000000002';

function createReviewsService(prisma: PrismaClient) {
  const products = new ProductTransactionalReadRepositoryAdapter();
  const listings = new ChannelListingQueryService(
    new ChannelListingQueryPersistenceAdapter(prisma as never),
    { findForListings: async () => [] },
  );
  return new ReviewsService(
    prisma as never,
    products,
    listings,
    new ChannelOptionRecipeService(
      new ChannelOptionRecipeRepositoryAdapter(prisma as never, products),
    ),
    new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never),
      new ChannelCredentialsAdapter(),
    ),
  );
}

describe('Review facts reader over disposable PostgreSQL', () => {
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

  it('publishes only the latest complete generation and isolates organizations', async () => {
    const oldRun = await run(TEST_ORGANIZATION_ID, 'completed', 1n);
    const runningRun = await run(TEST_ORGANIZATION_ID, 'running', 3n);
    const currentRun = await run(TEST_ORGANIZATION_ID, 'completed', 2n);
    const foreignRun = await run(OTHER_ORGANIZATION_ID, 'completed', 9n);

    await review(TEST_ORGANIZATION_ID, oldRun.id, 'shared-review', 'old complete');
    await review(TEST_ORGANIZATION_ID, runningRun.id, 'shared-review', 'running hidden');
    await review(TEST_ORGANIZATION_ID, currentRun.id, 'shared-review', 'current complete');
    await review(OTHER_ORGANIZATION_ID, foreignRun.id, 'foreign-review', 'foreign hidden');

    const result = await prisma.$transaction((tx) =>
      readCurrentReviewItems(tx, TEST_ORGANIZATION_ID, {}, 1, 50),
    );

    expect(result.map((item) => item.content)).toEqual(['current complete']);
  });

  it('excludes non-Coupang reviews without a completed source owner run', async () => {
    const completed = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'naver_reviews',
        status: 'completed',
      },
    });
    await prisma.review.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          platform: 'naver',
          externalReviewId: 'legacy-source-null',
          rating: 5,
          content: 'legacy hidden',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: completed.id,
          platform: 'naver',
          externalReviewId: 'completed-source',
          rating: 4,
          content: 'completed visible',
        },
      ],
    });

    const result = await prisma.$transaction((tx) =>
      readCurrentReviewItems(tx, TEST_ORGANIZATION_ID, {}, 1, 50),
    );

    expect(result.map((item) => item.content)).toEqual(['completed visible']);
  });

  it('reports listing order count only after canonical order facts are observed', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Reviews reader account',
        externalAccountId: 'reviews-reader-account',
      },
    });
    await prisma.channelAccount.create({
      data: {
        id: SOURCE_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'haebub-mall',
        name: 'Order collection source',
        externalAccountId: 'haebub-mall',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'REVIEW-LISTING',
        channelName: '리뷰 상품',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'REVIEW-OPTION',
      },
    });
    const reviewRun = await run(TEST_ORGANIZATION_ID, 'completed', 1n);
    await prisma.review.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: reviewRun.id,
        listingId: listing.id,
        platform: 'coupang',
        externalReviewId: 'listing-review',
        rating: 4,
      },
    });
    const service = createReviewsService(prisma);

    const unmeasured = await service.list(TEST_ORGANIZATION_ID, {});
    expect(unmeasured.items[0]?.orderCount).toBeNull();

    const orderRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: SOURCE_ACCOUNT_ID,
        sourceType: 'order_collection_mall',
        status: 'completed',
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceImportRunId: orderRun.id,
        externalOrderId: 'REVIEW-ORDER',
        orderedAt: new Date('2026-05-01T03:00:00.000Z'),
        status: 'paid',
        totalPrice: 999_999,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: option.id,
        externalLineId: 'REVIEW-LINE',
        totalPrice: 12_000,
      },
    });

    const partiallyObserved = await service.list(TEST_ORGANIZATION_ID, {});
    expect(partiallyObserved.items[0]?.orderCount).toBeNull();

    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: SOURCE_ACCOUNT_ID,
        sourceType: 'order_collection_mall',
        status: 'completed',
        coverageStartDate: new Date('2026-05-01T00:00:00.000Z'),
        coverageEndDate: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    const measured = await service.list(TEST_ORGANIZATION_ID, {});
    expect(measured.items[0]?.orderCount).toBe(1);
  });

  async function run(organizationId: string, status: string, publicationSequence: bigint) {
    return prisma.sourceImportRun.create({
      data: {
        organizationId,
        sourceType: 'coupang_reviews',
        status,
        publicationSequence,
        importedAt: new Date(`2026-05-0${Number(publicationSequence)}T00:00:00.000Z`),
      },
    });
  }

  async function review(
    organizationId: string,
    sourceImportRunId: string,
    externalReviewId: string,
    content: string,
  ) {
    await prisma.review.create({
      data: {
        organizationId,
        sourceImportRunId,
        platform: 'coupang',
        externalReviewId,
        rating: 5,
        content,
      },
    });
  }
});
