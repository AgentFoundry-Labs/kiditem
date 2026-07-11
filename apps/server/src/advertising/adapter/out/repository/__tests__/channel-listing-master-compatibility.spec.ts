import { describe, expect, it, vi } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../ad-campaign.repository.adapter';
import { AdListingRepositoryAdapter } from '../ad-listing.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from '../ad-strategy-context.repository.adapter';

describe('advertising nullable ChannelProduct compatibility', () => {
  it('does not pass an unlinked listing ID through grade-to-MasterProduct hydration', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'imported-listing-1', masterId: null },
        ]),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new AdCampaignRepositoryAdapter(prisma as never);

    const totals = await repository.findGradeBudgetTotals('org-1', [
      {
        businessDate: new Date('2026-07-11T00:00:00.000Z'),
        adSpend: 1000,
        adRevenue: 0,
        adClicks: 0,
        adImpressions: 0,
        adConversions: 0,
        listingId: 'imported-listing-1',
      },
    ]);

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.masterProduct.findMany).not.toHaveBeenCalled();
    expect(totals).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('skips an unlinked listing during advertising listing hydration', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'imported-listing-1',
            externalId: 'imported-product-1',
            channelName: 'Wing import only',
            masterId: null,
          },
        ]),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new AdListingRepositoryAdapter(prisma as never);

    const listings = await repository.findScopedAdListings(
      'org-1',
      ['imported-listing-1'],
    );

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.masterProduct.findMany).not.toHaveBeenCalled();
    expect(listings).toEqual(new Map());
  });

  it('does not update a MasterProduct ad tier for an unlinked listing', async () => {
    const prisma = {
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({ masterId: null }),
      },
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new AdListingRepositoryAdapter(prisma as never);

    const updated = await repository.changeAdTier(
      'imported-listing-1',
      'org-1',
      'growth',
    );

    expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.masterProduct.updateMany).not.toHaveBeenCalled();
    expect(updated).toBe(false);
  });

  it('skips an unlinked listing during strategy-context hydration', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'imported-listing-1',
            externalId: 'imported-product-1',
            channelName: 'Wing import only',
            masterId: null,
            options: [],
          },
        ]),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new AdStrategyContextRepositoryAdapter(prisma as never);

    const listings = await repository.hydrateListings(
      'org-1',
      ['imported-listing-1'],
    );

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.masterProduct.findMany).not.toHaveBeenCalled();
    expect(listings).toEqual([]);
  });
});
