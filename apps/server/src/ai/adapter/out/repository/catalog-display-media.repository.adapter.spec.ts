import { describe, expect, it, vi } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from './catalog-display-media.repository.adapter';

describe('CatalogDisplayMediaRepositoryAdapter', () => {
  it('returns only active Coupang provider assets and performs no write', async () => {
    const findMany = vi.fn(async () => [{
      channelListingId: 'listing-1',
      contentGenerationGroups: [{
        originatingAssets: [
          asset('provider-option', 'https://cdn.example/option.jpg', 'option', {
            sourceType: 'coupang_catalog', externalOptionId: 'option-1', active: true,
          }),
          asset('provider-primary', 'https://cdn.example/primary.jpg', 'primary', {
            sourceType: 'coupang_catalog', active: true,
          }),
          asset('inactive', 'https://cdn.example/inactive.jpg', 'primary', {
            sourceType: 'coupang_catalog', active: false,
          }),
          asset('custom', 'https://cdn.example/custom.jpg', 'primary', { sourceType: 'custom' }),
        ],
      }],
    }]);
    const prisma = { contentWorkspace: { findMany } };
    const adapter = new CatalogDisplayMediaRepositoryAdapter(prisma as never);

    const result = await adapter.findCoupangCandidates({
      organizationId: 'org-1',
      channelListingIds: ['listing-1', 'listing-1'],
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'provider-option', externalOptionId: 'option-1', role: 'option',
      }),
      expect.objectContaining({
        id: 'provider-primary', externalOptionId: null, role: 'primary',
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: 'channel_listing',
        channelListingId: { in: ['listing-1'] },
        channelListing: expect.objectContaining({
          is: expect.objectContaining({
            isActive: true,
            channelAccount: expect.objectContaining({
              is: expect.objectContaining({ channel: 'coupang', status: 'active' }),
            }),
          }),
        }),
      }),
    }));
    expect(Object.keys(prisma.contentWorkspace)).toEqual(['findMany']);
  });
});

function asset(
  id: string,
  url: string,
  role: 'primary' | 'option',
  metadata: Record<string, unknown>,
) {
  return { id, url, role, sortOrder: 0, metadata };
}
