import { describe, expect, it, vi } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from './catalog-display-media.repository.adapter';

describe('CatalogDisplayMediaRepositoryAdapter', () => {
  it('returns active provider assets across channels and performs no write', async () => {
    const findMany = vi.fn(async () => [{
      channelListingId: 'listing-1',
      channelListing: { channelAccount: { channel: 'coupang' } },
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
    }, {
      channelListingId: 'listing-2',
      channelListing: { channelAccount: { channel: 'naver' } },
      contentGenerationGroups: [{
        originatingAssets: [
          asset('naver-primary', 'https://cdn.example/naver.jpg', 'primary', {
            sourceType: 'channel_catalog', channel: 'naver', active: true,
          }),
        ],
      }],
    }]);
    const prisma = { contentWorkspace: { findMany } };
    const adapter = new CatalogDisplayMediaRepositoryAdapter(prisma as never);

    const result = await adapter.findCandidates({
      organizationId: 'org-1',
      channelListingIds: ['listing-1', 'listing-1', 'listing-2'],
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'provider-option', externalOptionId: 'option-1', role: 'option',
        channel: 'coupang',
      }),
      expect.objectContaining({
        id: 'provider-primary', externalOptionId: null, role: 'primary',
        channel: 'coupang',
      }),
      expect.objectContaining({
        id: 'naver-primary', externalOptionId: null, role: 'primary',
        channel: 'naver',
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: 'channel_listing',
        channelListingId: { in: ['listing-1', 'listing-2'] },
        channelListing: expect.objectContaining({
          is: expect.objectContaining({
            isActive: true,
            channelAccount: expect.objectContaining({
              is: expect.not.objectContaining({ channel: expect.anything() }),
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
