import { realRegistrationStates } from '../../../../../../test-helpers/registration-state';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { COUPANG_DIRECTSHIP_KIND } from '@kiditem/shared/orders-operations';
import { seedMallOrderCoverageOperation } from '../../../../../../test-helpers/__tests__/mall-order-coverage-operation';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../../test-helpers/real-prisma';
import { readCurrentReviewItems } from '../review-facts.reader';
import { ReviewsService } from '../../../../../application/service/reviews.service';
import type { PrismaClient } from '@prisma/client';
import { ProductTransactionalReadRepositoryAdapter } from '../../../../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelListingQueryService } from '../../../../../../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../../../../../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelOptionRecipeService } from '../../../../../../channels/application/service/listing/channel-option-recipe.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../../../../../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelAccountService } from '../../../../../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../../../../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../../../../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../../../../../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

const ACCOUNT_ID = '73000000-0000-4000-8000-000000000001';
const SOURCE_ACCOUNT_ID = '73000000-0000-4000-8000-000000000002';

function createReviewsService(prisma: PrismaClient) {
  const products = new ProductTransactionalReadRepositoryAdapter();
  const listings = new ChannelListingQueryService(
    new ChannelListingQueryPersistenceAdapter(prisma as never),
    { findForListings: async () => [] },
    realRegistrationStates(prisma),
  );
  return new ReviewsService(
    prisma as never,
    products,
    listings,
    new ChannelOptionRecipeService(
      new ChannelOptionRecipeRepositoryAdapter(prisma as never, products, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
    ),
    new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
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

  it('shows only reviews an operation wrote — old import run rows and unowned rows are not current, other organizations stay out', async () => {
    const legacyRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_reviews',
        status: 'completed',
        publicationSequence: 9n,
        importedAt: new Date('2026-05-09T00:00:00.000Z'),
      },
    });
    const naverRun = await prisma.sourceImportRun.create({
      data: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'naver_reviews', status: 'completed' },
    });
    await prisma.review.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: legacyRun.id,
          platform: 'coupang',
          externalReviewId: 'moved-review',
          rating: 5,
          content: 'legacy generation hidden',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: legacyRun.id,
          platform: 'coupang',
          externalReviewId: 'legacy-only',
          rating: 5,
          content: 'legacy only hidden',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: naverRun.id,
          platform: 'naver',
          externalReviewId: 'naver-run',
          rating: 4,
          content: 'non-coupang run hidden',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          operationId: '74000000-0000-4000-8000-000000000001',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
          platform: 'coupang',
          externalReviewId: 'moved-review',
          rating: 4,
          content: 'operation current',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          operationId: '74000000-0000-4000-8000-000000000001',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
          platform: 'coupang',
          externalReviewId: 'operation-only',
          rating: 3,
          content: 'operation only',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          platform: 'coupang',
          externalReviewId: 'unowned',
          rating: 1,
          content: 'unowned hidden',
        },
      ],
    });
    await prisma.review.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        operationId: '74000000-0000-4000-8000-000000000002',
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        platform: 'coupang',
        externalReviewId: 'moved-review',
        rating: 5,
        content: 'foreign operation hidden',
      },
    });

    const result = await prisma.$transaction((tx) =>
      readCurrentReviewItems(tx, TEST_ORGANIZATION_ID, {}, 1, 50),
    );

    expect(result.map((item) => item.content).sort()).toEqual(['operation current', 'operation only']);
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
    await prisma.review.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationId: '74000000-0000-4000-8000-000000000003',
        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
        listingId: listing.id,
        platform: 'coupang',
        externalReviewId: 'listing-review',
        rating: 4,
      },
    });
    const service = createReviewsService(prisma);

    const unmeasured = await service.list(TEST_ORGANIZATION_ID, {});
    expect(unmeasured.items[0]?.orderCount).toBeNull();

    const orderOperation = await prisma.operation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, kind: COUPANG_DIRECTSHIP_KIND, status: 'succeeded', token: randomUUID(),
        expiresAt: new Date(), finishedAt: new Date(), attempts: 1,
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        operationId: orderOperation.id,
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

    await seedMallOrderCoverageOperation(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: SOURCE_ACCOUNT_ID,
      mallKey: 'haebub-mall',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    });

    const measured = await service.list(TEST_ORGANIZATION_ID, {});
    expect(measured.items[0]?.orderCount).toBe(1);
  });
});
