import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { channelListingsApi } from './channel-listings-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('channelListingsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('loads registered marketplace listings with filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 2,
      limit: 20,
      marketCounts: [],
    });

    await channelListingsApi.list({
      page: 2,
      limit: 20,
      sort: 'name_asc',
      channel: 'coupang',
      channelAccountId: 'account-1',
      search: '다트',
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/channels/listings?page=2&limit=20&sort=name_asc&channel=coupang&channelAccountId=account-1&search=%EB%8B%A4%ED%8A%B8',
    );
  });

  it('loads one registered listing workspace', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'listing-1',
      masterId: 'master-1',
    });

    await channelListingsApi.getWorkspace('listing-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/listings/listing-1/workspace');
  });

  it('loads registered products as MasterProduct groups including deleted tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      marketCounts: [],
    });

    await channelListingsApi.listGroups({
      tab: 'deleted',
      channel: 'coupang',
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/channels/listings/groups?page=1&limit=20&channel=coupang&tab=deleted',
    );
  });
});
