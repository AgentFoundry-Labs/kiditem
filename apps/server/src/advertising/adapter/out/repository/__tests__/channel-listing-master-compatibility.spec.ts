import { describe, expect, it, vi } from 'vitest';
import { AdListingRepositoryAdapter } from '../ad-listing.repository.adapter';

describe('advertising MasterProduct ownership compatibility', () => {
  it('updates ad tier on the operational product linked to the scoped active listing', async () => {
    const prisma = {
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new AdListingRepositoryAdapter(prisma as never);

    await expect(
      repository.changeAdTier('listing-1', 'org-1', 'growth'),
    ).resolves.toBe(true);
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        channelListings: {
          some: {
            id: 'listing-1',
            organizationId: 'org-1',
            isActive: true,
          },
        },
      },
      data: { adTier: 'growth' },
    });
  });

});
