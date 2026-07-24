import { describe, expect, it, vi } from 'vitest';
import { CatalogDisplayMediaService } from './catalog-display-media.service';

describe('CatalogDisplayMediaService', () => {
  it('selects an exact option image, then a listing primary, across ordered listing candidates', async () => {
    const findCoupangCandidates = vi.fn(async () => [
      candidate({ id: 'primary-first', channelListingId: 'listing-1', role: 'primary', url: 'https://cdn.example/primary-1.jpg' }),
      candidate({ id: 'wrong-option', channelListingId: 'listing-1', role: 'option', externalOptionId: 'other', url: 'https://cdn.example/other.jpg' }),
      candidate({ id: 'exact-second', channelListingId: 'listing-2', role: 'option', externalOptionId: 'option-2', url: 'https://cdn.example/exact-2.jpg' }),
      candidate({ id: 'primary-second', channelListingId: 'listing-2', role: 'primary', url: 'https://cdn.example/primary-2.jpg' }),
    ]);
    const service = new CatalogDisplayMediaService({ findCoupangCandidates });

    const result = await service.findCoupangDisplayMedia({
      organizationId: 'org-1',
      requests: [
        {
          key: 'exact',
          candidates: [{ channelListingId: 'listing-2', externalOptionId: 'option-2' }],
        },
        {
          key: 'primary-fallback',
          candidates: [{ channelListingId: 'listing-1', externalOptionId: 'missing' }],
        },
        {
          key: 'next-listing',
          candidates: [
            { channelListingId: 'listing-empty', externalOptionId: 'option-empty' },
            { channelListingId: 'listing-2', externalOptionId: 'missing' },
          ],
        },
      ],
    });

    expect(findCoupangCandidates).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelListingIds: ['listing-1', 'listing-2', 'listing-empty'],
    });
    expect(result.get('exact')).toEqual({
      url: 'https://cdn.example/exact-2.jpg',
      source: 'coupang_catalog',
      channelListingId: 'listing-2',
      externalOptionId: 'option-2',
    });
    expect(result.get('primary-fallback')).toMatchObject({
      url: 'https://cdn.example/primary-1.jpg',
      channelListingId: 'listing-1',
      externalOptionId: 'missing',
    });
    expect(result.get('next-listing')).toMatchObject({
      url: 'https://cdn.example/primary-2.jpg',
      channelListingId: 'listing-2',
      externalOptionId: 'missing',
    });
  });

  it('uses deterministic asset ties, omits requests without an eligible asset, and rejects duplicate keys', async () => {
    const service = new CatalogDisplayMediaService({
      findCoupangCandidates: vi.fn(async () => [
        candidate({ id: 'z-id', channelListingId: 'listing-1', role: 'primary', sortOrder: 1, url: 'https://cdn.example/z.jpg' }),
        candidate({ id: 'a-id', channelListingId: 'listing-1', role: 'primary', sortOrder: 1, url: 'https://cdn.example/a.jpg' }),
        candidate({ id: 'first-id', channelListingId: 'listing-1', role: 'primary', sortOrder: 0, url: 'https://cdn.example/x.jpg' }),
      ]),
    });

    const result = await service.findCoupangDisplayMedia({
      organizationId: 'org-1',
      requests: [
        { key: 'winner', candidates: [{ channelListingId: 'listing-1', externalOptionId: null }] },
        { key: 'missing', candidates: [{ channelListingId: 'listing-2', externalOptionId: null }] },
      ],
    });

    expect(result.get('winner')?.url).toBe('https://cdn.example/x.jpg');
    expect(result.has('missing')).toBe(false);
    await expect(service.findCoupangDisplayMedia({
      organizationId: 'org-1',
      requests: [
        { key: 'duplicate', candidates: [] },
        { key: 'duplicate', candidates: [] },
      ],
    })).rejects.toThrow('Duplicate catalog display media request key: duplicate');
  });
});

function candidate(input: {
  id: string;
  channelListingId: string;
  url: string;
  role: 'primary' | 'option';
  sortOrder?: number;
  externalOptionId?: string | null;
}) {
  return {
    ...input,
    sortOrder: input.sortOrder ?? 0,
    externalOptionId: input.externalOptionId ?? null,
  };
}
