import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSummary, ReviewsService } from '../reviews.service';
import {
  readCurrentReviewListingAggregates,
  readCurrentReviewRecentCounts,
} from '../../read/review-facts.reader';
import {
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readOrderWindowFacts,
} from '../../read/order-facts.reader';

vi.mock('../../read/review-facts.reader', () => ({
  readCurrentReviewContentCount: vi.fn(),
  readCurrentReviewItemCount: vi.fn(),
  readCurrentReviewItems: vi.fn(),
  readCurrentReviewListingAggregates: vi.fn(),
  readCurrentReviewListingStats: vi.fn(),
  readCurrentReviewRatingCounts: vi.fn(),
  readCurrentReviewRecentCounts: vi.fn(),
}));
vi.mock('../../read/order-facts.reader', () => ({
  ORDER_FACT_EXCLUDED_STATUSES: ['cancelled', 'returned', 'refunded'],
  readListingOptionOrderFacts: vi.fn(),
  readObservedOrderBounds: vi.fn(),
  readOrderWindowFacts: vi.fn(),
}));
vi.mock('../../../products/adapter/out/persistence/read/product-abc-publication.reader', () => ({
  readPublishedProductAbcGrades: vi.fn().mockResolvedValue(new Map()),
}));


describe('ReviewsService', () => {
  const tx = {
    organization: { findUnique: vi.fn() },
  };
  const products = {
    readSourceIdentities: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const channelListings = { readDisplayFacts: vi.fn(), readOptionCandidates: vi.fn() };
  const channelRecipes = {
    readListingProductSummaries: vi.fn(),
    readConfirmedCompositions: vi.fn(),
  };
  const channelAccounts = { findByIds: vi.fn(async () => []) };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    products.readSourceIdentities.mockResolvedValue([]);
    channelListings.readDisplayFacts.mockResolvedValue([]);
    channelListings.readOptionCandidates.mockResolvedValue([]);
    channelRecipes.readListingProductSummaries.mockResolvedValue(new Map());
    channelRecipes.readConfirmedCompositions.mockResolvedValue([]);
    tx.organization.findUnique.mockResolvedValue({ name: '회사' });
    vi.mocked(readObservedOrderBounds).mockResolvedValue({
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-05-01T00:00:00.000Z'),
    });
  });

  it('sorts and paginates current complete listing aggregates', async () => {
    vi.mocked(readCurrentReviewListingAggregates).mockResolvedValue([
      { listingId: 'listing-low', totalReviews: 2, avgRating: 5, lastReviewAt: null },
      { listingId: 'listing-top', totalReviews: 8, avgRating: 4.5, lastReviewAt: null },
    ]);
    vi.mocked(readCurrentReviewRecentCounts).mockResolvedValue([
      { listingId: 'listing-top', count: 3 },
    ]);
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: 20_000,
      orderCount: 1,
      quantity: 1,
      observedAt: new Date(),
      observedTotals: { revenue: 20_000, orderCount: 1, quantity: 1 },
      requestedDates: ['2026-04-01'],
      includedDates: ['2026-04-01'],
      missingDates: [],
      sourceCoverage: [],
    });
    vi.mocked(readListingOptionOrderFacts).mockResolvedValue([{
      orderId: 'order-1',
      channelAccountId: 'account-1',
      listingOptionId: 'option-top',
      revenue: 20_000,
      quantity: 1,
    }]);
    channelListings.readDisplayFacts.mockResolvedValue([
      display('listing-low', '낮은 리뷰 상품'),
      display('listing-top', '상위 리뷰 상품', 'master-top'),
    ]);
    channelRecipes.readListingProductSummaries.mockResolvedValue(new Map([
      ['listing-low', null],
      ['listing-top', 'master-top'],
    ]));
    products.readSourceIdentities.mockResolvedValue([
      sourceProduct('master-top', '상품 source name'),
    ]);
    channelRecipes.readConfirmedCompositions.mockResolvedValue([
      { optionId: 'option-top', listingId: 'listing-top', accountId: 'account-1', components: [] },
    ]);

    const result = await new ReviewsService(
      prisma as never,
      products as never,
      channelListings as never,
      channelRecipes as never,
      channelAccounts as never,
    ).list('organization-1', {
      page: 1,
      limit: 1,
      filter: 'all',
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      listingId: 'listing-top',
      productId: 'master-top',
      productName: '상품 source name',
      recentReviews: 3,
      orderCount: 1,
    });
    expect(products.readSourceIdentities).toHaveBeenCalledWith(
      { client: tx },
      {
        organizationId: 'organization-1',
        selector: { kind: 'ids', values: ['master-top'] },
      },
    );
    expect(channelListings.readDisplayFacts).toHaveBeenCalledWith(expect.any(Object), {
      organizationId: 'organization-1',
      listingIds: ['listing-low', 'listing-top'],
      activeOnly: true,
    });
  });

  it('keeps listing order counts null before any order observation', async () => {
    vi.mocked(readCurrentReviewListingAggregates).mockResolvedValue([
      { listingId: 'listing-1', totalReviews: 1, avgRating: 4, lastReviewAt: null },
    ]);
    vi.mocked(readCurrentReviewRecentCounts).mockResolvedValue([]);
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-04-01'],
      includedDates: [],
      missingDates: ['2026-04-01'],
      sourceCoverage: [],
    });
    channelListings.readDisplayFacts.mockResolvedValue([display('listing-1', '상품')]);

    const result = await new ReviewsService(
      prisma as never,
      products as never,
      channelListings as never,
      channelRecipes as never,
      channelAccounts as never,
    ).list('organization-1', {});

    expect(result.items[0]?.orderCount).toBeNull();
  });
});

describe('computeSummary', () => {
  it('returns null average when no review facts exist', () => {
    expect(computeSummary([]).weightedAvgRating).toBeNull();
  });

  it('weights each listing rating by its review count', () => {
    expect(computeSummary([
      { listingId: 'a', totalReviews: 3, avgRating: 5, lastReviewAt: null },
      { listingId: 'b', totalReviews: 1, avgRating: 1, lastReviewAt: null },
    ]).weightedAvgRating).toBe(4);
  });
});

function display(id: string, productName: string, masterProductId: string | null = null) {
  return {
    id,
    externalId: `external-${id}`,
    accountId: 'account-1',
    channelName: productName,
    displayName: null,
    category: null,
    imageUrl: null,
    firstActiveSellerSku: null,
    masterProductId,
  };
}

function sourceProduct(masterProductId: string, name: string) {
  return {
    masterProductId,
    code: 'KID123',
    sourceAccountKey: 'kiditem',
    sourceProductCode: 'source-product',
    sourceOptionCode: 'source-option',
    name,
    optionName: null,
    barcode: null,
    purchasePrice: null,
    imageUrls: [],
  };
}
