import { describe, expect, it, vi } from 'vitest';
import { ProfitabilityAdRefreshRepositoryAdapter } from '../profitability-ad-refresh.repository.adapter';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function makeAdapter() {
  const tx = {
    channelScrapeRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    channelAdTargetDailySnapshot: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    channelAccount: {
      findMany: vi.fn().mockResolvedValue([{ id: ACCOUNT_ID }]),
    },
    channelListingOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListing: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    $queryRaw: vi.fn().mockResolvedValue([{ publishedCount: 1n }]),
  };
  return {
    adapter: new ProfitabilityAdRefreshRepositoryAdapter(prisma as never),
    prisma,
    tx,
  };
}

describe('ProfitabilityAdRefreshRepositoryAdapter', () => {
  it('counts recipe-backed active listings instead of relying on the derived listing summary', async () => {
    const { adapter, prisma } = makeAdapter();

    await expect(adapter.countActiveListings(ORGANIZATION_ID)).resolves.toBe(1);

    expect(prisma.channelListing.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        options: {
          some: {
            isActive: true,
            inventoryComponents: {
              some: {
                sellpiaInventorySku: { is: { masterProductId: { not: null } } },
              },
            },
          },
        },
      }),
    });
  });

  it('replaces only prior profitability-report targets, preserving campaign sweep facts', async () => {
    const { adapter, tx } = makeAdapter();

    await adapter.replaceReportSlice({
      organizationId: ORGANIZATION_ID,
      collectionRunId: '33333333-3333-4333-8333-333333333333',
      advertiserId: 'A00057379',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
      observedAt: new Date('2026-08-03T00:00:00.000Z'),
      report: {
        campaignCount: 0,
        expectedRowCount: 0,
        collectedRowCount: 0,
        businessDates: ['2026-08-01'],
        rows: [],
      },
    });

    expect(tx.channelAdTargetDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        targetType: 'product',
        targetKey: { startsWith: 'profitability-report:' },
      }),
    });
  });

  it('projects listing profitability from the report source only', async () => {
    const { adapter, prisma } = makeAdapter();

    await expect(adapter.publishSlice({
      organizationId: ORGANIZATION_ID,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
      observedAt: new Date('2026-08-03T00:00:00.000Z'),
    })).resolves.toBe(1);

    const [query] = prisma.$queryRaw.mock.calls[0] ?? [];
    expect((query as { sql?: string }).sql).toContain(
      "target_key LIKE 'profitability-report:%'",
    );
    expect((query as { sql?: string }).sql).toContain(
      'channel_listing_option_inventory_components',
    );
  });

  it('falls back to an active Coupang listing when the report is product-grain', async () => {
    const { adapter, prisma, tx } = makeAdapter();
    prisma.channelListing.findMany.mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      externalId: '176621004',
    }]);

    await adapter.replaceReportSlice({
      organizationId: ORGANIZATION_ID,
      collectionRunId: '33333333-3333-4333-8333-333333333333',
      advertiserId: 'A00057379',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
      observedAt: new Date('2026-08-03T00:00:00.000Z'),
      report: {
        campaignCount: 1,
        expectedRowCount: 1,
        collectedRowCount: 1,
        businessDates: ['2026-08-01'],
        rows: [{
          businessDate: '2026-08-01',
          externalOptionId: '176621004',
          adSpend: 1200,
          impressions: 30,
          clicks: 2,
          orders: 1,
          conversions: 1,
          adRevenue: 5000,
        }],
      },
    });

    expect(tx.channelAdTargetDailySnapshot.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        listingId: '44444444-4444-4444-8444-444444444444',
        listingOptionId: null,
        externalId: '176621004',
        externalOptionId: '176621004',
      })],
    });
  });
});
