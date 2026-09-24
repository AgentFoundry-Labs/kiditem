import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelDashboardRepositoryAdapter } from '../../../../adapter/out/repository/channel-dashboard.repository.adapter';
import {
  readDailyOrderFacts,
  readListingOptionOrderFacts,
  readOrderStatusCount,
  readOrderWindowFacts,
} from '../../../../../orders/adapter/out/persistence/read/order-facts.reader';
import type { PrismaService } from '../../../../../prisma/prisma.service';

vi.mock('../../../../../orders/adapter/out/persistence/read/order-facts.reader', () => ({
  readDailyOrderFacts: vi.fn(),
  readListingOptionOrderFacts: vi.fn(),
  readOrderStatusCount: vi.fn(),
  readOrderWindowFacts: vi.fn(),
}));

const ORGANIZATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('ChannelDashboardRepositoryAdapter', () => {
  const tx = {
    channelListing: { findFirst: vi.fn() },
    channelListingOption: { findMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  let service: ChannelDashboardRepositoryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new ChannelDashboardRepositoryAdapter(prisma as unknown as PrismaService, {
      findByIds: vi.fn(async () => []),
    } as never);
  });

  it('keeps unobserved today metrics null and returns operational counts', async () => {
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-04-20'],
      includedDates: [],
      missingDates: ['2026-04-20'],
      sourceCoverage: [],
    });
    vi.mocked(readOrderStatusCount).mockResolvedValue(2);
    tx.channelListing.findFirst.mockResolvedValue({
      updatedAt: new Date('2026-04-20T05:00:00.000Z'),
    });

    const result = await service.getSummary(ORGANIZATION_ID);

    expect(result).toEqual({
      todayOrders: { count: null, revenue: null },
      pendingAccept: 2,
      lastModifiedAt: new Date('2026-04-20T05:00:00.000Z'),
    });
  });

  it('maps daily canonical facts to the dashboard trend contract', async () => {
    vi.mocked(readDailyOrderFacts).mockResolvedValue([
      { day: '2026-04-15', revenue: 120_000, orderCount: 4, quantity: 5 },
    ]);

    await expect(service.getRevenueTrend(
      ORGANIZATION_ID,
      new Date('2026-04-14T15:00:00.000Z'),
      new Date('2026-04-15T15:00:00.000Z'),
    )).resolves.toEqual([{ day: '2026-04-15', revenue: 120_000, orderCount: 4 }]);
  });

  it('resolves listing display metadata without combining channel accounts', async () => {
    vi.mocked(readListingOptionOrderFacts).mockResolvedValue([
      {
        orderId: 'order-1',
        channelAccountId: 'account-1',
        listingOptionId: 'option-1',
        revenue: 45_000,
        quantity: 2,
      },
      {
        orderId: 'order-2',
        channelAccountId: 'account-other',
        listingOptionId: 'option-1',
        revenue: 999_999,
        quantity: 1,
      },
    ]);
    tx.channelListingOption.findMany.mockResolvedValue([{
      id: 'option-1',
      listing: {
        id: 'listing-1',
        organizationId: ORGANIZATION_ID,
        channelAccountId: 'account-1',
        externalId: 'external-1',
        channelName: '상품 1',
        displayName: null,
      },
    }]);

    const result = await service.getProductRanking(
      ORGANIZATION_ID,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    );

    expect(result).toEqual([{
      sellerProductId: 'external-1',
      sellerProductName: '상품 1',
      revenue: 45_000,
      orderCount: 1,
    }]);
  });
});
