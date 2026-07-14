import { describe, expect, it, vi } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../ad-campaign.repository.adapter';
import { AdListingRepositoryAdapter } from '../ad-listing.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from '../ad-strategy-context.repository.adapter';

describe('advertising ChannelListing ownership compatibility', () => {
  it('computes grade budgets directly from ChannelListing metadata', async () => {
    const prisma = {
      channelListing: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'listing-1', abcGrade: 'A' }]),
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
        listingId: 'listing-1',
      },
    ]);

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
        select: { id: true, abcGrade: true },
      }),
    );
    expect(totals).toEqual({ A: 1000, B: 0, C: 0 });
  });

  it('hydrates the legacy response key from ChannelListing without MasterProduct', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'listing-1',
            externalId: 'seller-product-1',
            channelName: 'Wing product',
            displayName: 'Display product',
            abcGrade: 'B',
            adTier: 'growth',
            healthScore: 73,
          },
        ]),
      },
    };
    const repository = new AdListingRepositoryAdapter(prisma as never);

    const listings = await repository.findScopedAdListings('org-1', [
      'listing-1',
    ]);

    expect(listings.get('listing-1')).toEqual({
      id: 'listing-1',
      externalId: 'seller-product-1',
      channelName: 'Wing product',
      masterProduct: {
        id: 'listing-1',
        code: 'seller-product-1',
        name: 'Display product',
        abcGrade: 'B',
        adTier: 'growth',
        healthScore: 73,
      },
    });
  });

  it('updates ad tier on the scoped active ChannelListing', async () => {
    const prisma = {
      channelListing: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new AdListingRepositoryAdapter(prisma as never);

    await expect(
      repository.changeAdTier('listing-1', 'org-1', 'growth'),
    ).resolves.toBe(true);
    expect(prisma.channelListing.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-1', organizationId: 'org-1', isActive: true },
      data: { adTier: 'growth' },
    });
  });

  it('hydrates strategy metadata and primary option from ChannelListing', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'listing-1',
            externalId: 'seller-product-1',
            channelName: 'Wing product',
            displayName: null,
            abcGrade: 'C',
            adTier: null,
            healthScore: 50,
            options: [
              {
                id: 'listing-option-1',
                salePrice: 12000,
                costPriceOverride: 4000,
                commissionRate: 0.1,
                shippingCost: 3000,
              },
            ],
          },
        ]),
      },
    };
    const repository = new AdStrategyContextRepositoryAdapter(prisma as never);

    const listings = await repository.hydrateListings('org-1', ['listing-1']);

    expect(listings).toEqual([
      {
        id: 'listing-1',
        externalId: 'seller-product-1',
        channelName: 'Wing product',
        masterProduct: {
          id: 'listing-1',
          code: 'seller-product-1',
          name: 'Wing product',
          abcGrade: 'C',
          adTier: null,
          healthScore: 50,
        },
        primaryOption: {
          listingOptionId: 'listing-option-1',
          sellableStock: null,
          purchaseCost: 4000,
          salePrice: 12000,
          commissionRate: 0.1,
          shippingCost: 3000,
        },
      },
    ]);
  });
});
