import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { channelListingsApi, readCoupangCatalogCollectionLink } from './channel-listings-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const accountId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';

describe('readCoupangCatalogCollectionLink', () => {
  it('reads an exact account handoff and keeps a malformed link distinguishable', () => {
    expect(readCoupangCatalogCollectionLink(
      `collectionAttempt=${attemptId}&channelAccountId=${accountId}&collectionStage=basics`,
    )).toEqual({ attemptId, channelAccountId: accountId, stage: 'basics' });
    expect(readCoupangCatalogCollectionLink(`channelAccountId=${accountId}`)).toEqual({ invalid: true });
    expect(readCoupangCatalogCollectionLink('page=2')).toBeNull();
  });
});

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
      createdSince: '2026-05-11T00:00:00.000Z',
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/channels/listings?page=2&limit=20&sort=name_asc&channel=coupang&channelAccountId=account-1&search=%EB%8B%A4%ED%8A%B8&createdSince=2026-05-11T00%3A00%3A00.000Z',
    );
  });

  it('loads one registered listing workspace', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'listing-1',
      listingName: '쿠팡 등록 상품',
    });

    await channelListingsApi.getWorkspace('listing-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/listings/listing-1/workspace');
  });

  it('loads deleted registered listings through the canonical list endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      marketCounts: [],
    });

    await channelListingsApi.list({
      tab: 'deleted',
      channel: 'coupang',
      createdSince: '2026-05-11T00:00:00.000Z',
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/channels/listings?page=1&limit=20&channel=coupang&createdSince=2026-05-11T00%3A00%3A00.000Z&tab=deleted',
    );
  });
});
