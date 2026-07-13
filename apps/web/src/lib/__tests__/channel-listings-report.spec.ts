import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { fetchAllChannelListingsForReport } from '@/lib/channel-listings-report';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

describe('fetchAllChannelListingsForReport', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  it('loads every server page from the listing owner', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        items: [{ id: 'listing-1' }],
        total: 2,
        page: 1,
        limit: 100,
        marketCounts: [],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'listing-2' }],
        total: 2,
        page: 2,
        limit: 100,
        marketCounts: [],
      });

    await expect(fetchAllChannelListingsForReport(1)).resolves.toEqual([
      { id: 'listing-1' },
      { id: 'listing-2' },
    ]);
    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/channels/listings?page=1&limit=1',
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/channels/listings?page=2&limit=1',
    );
  });
});
