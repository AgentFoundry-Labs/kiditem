import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { channelListingsApi } from './channel-listings-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const accountId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const owner = {
  attemptId, channelAccountId: accountId, idempotencyKey: attemptId, state: 'RUNNING',
  expiresAt: '2030-01-01T00:00:00.000Z',
  plan: { channelAccountId: accountId, collectorVersion: 'wing-inventory-v1', vendorId: 'A001',
    listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail', publicationRevision: '0' },
  phase: 'hydration', collectorVersion: 'wing-inventory-v1', manifest: null,
  progress: {
    discoveryPagesStored: 0, discoveredProducts: 0, hydratedProducts: 0, optionCount: 0,
    mediaCount: 0, storedChunks: 0, publishedProducts: 0, publishedOptionCount: 0,
    publishedMediaCount: 0, publishedChunks: 0, firstPublishedAt: null, lastPublishedAt: null,
  },
  missing: { discoverySequences: [], productIds: [] }, snapshotHash: null,
  error: null, publication: null, createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z', finishedAt: null,
};

it('reads safe owner status from the exact account and attempt, rejecting mismatched identities', async () => {
  vi.mocked(apiClient.get).mockResolvedValue(owner);
  await expect(channelListingsApi.getCoupangCatalogCollection(accountId, attemptId)).resolves.toEqual(owner);
  expect(apiClient.get).toHaveBeenCalledWith(
    `/api/channels/accounts/${accountId}/catalog-imports/coupang-wing/attempts/${attemptId}`,
  );
  for (const wrong of [
    { ...owner, attemptId: accountId },
    { ...owner, channelAccountId: attemptId },
    { ...owner, plan: { ...owner.plan, channelAccountId: attemptId } },
  ]) {
    vi.mocked(apiClient.get).mockResolvedValue(wrong);
    await expect(channelListingsApi.getCoupangCatalogCollection(accountId, attemptId)).rejects.toThrow('일치');
  }
});

it('cancels through the fenced owner fail endpoint with the token only in its header', async () => {
  const failure = { code: 'USER_CANCELLED', message: '사용자가 수집을 중단했습니다.', phase: 'hydration' as const };
  await channelListingsApi.failCoupangCatalogCollection(accountId, attemptId, 'opaque-token', failure);
  expect(apiClient.post).toHaveBeenCalledWith(
    `/api/channels/accounts/${accountId}/catalog-imports/coupang-wing/attempts/${attemptId}/fail`,
    failure, { headers: { 'x-source-attempt-token': 'opaque-token' } },
  );
});

it('begins with the original key header and strict collector input, rejecting another account permit', async () => {
  const account = '11111111-1111-4111-8111-111111111111';
  const key = '22222222-2222-4222-8222-222222222222';
  const permit = {
    attemptId: key, attemptToken: key, state: 'RUNNING', expiresAt: '2030-01-01T00:00:00.000Z',
    plan: { channelAccountId: account, collectorVersion: 'wing-inventory-v1', vendorId: 'A001',
      listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail', publicationRevision: '0' },
  };
  vi.mocked(apiClient.post).mockResolvedValue(permit);
  await expect(channelListingsApi.startCoupangCatalogCollection(account, { collectorVersion: 'wing-inventory-v1' }, key))
    .resolves.toEqual(permit);
  expect(apiClient.post).toHaveBeenCalledWith(
    `/api/channels/accounts/${account}/catalog-imports/coupang-wing/attempts`,
    { collectorVersion: 'wing-inventory-v1' }, { headers: { 'Idempotency-Key': key } },
  );
  vi.mocked(apiClient.post).mockResolvedValue({ ...permit, plan: { ...permit.plan, channelAccountId: key } });
  await expect(channelListingsApi.startCoupangCatalogCollection(account, { collectorVersion: 'wing-inventory-v1' }, key))
    .rejects.toThrow('일치');
});

it('rejects a permit whose returned stage differs from the requested stage', async () => {
  const account = '11111111-1111-4111-8111-111111111111';
  const key = '22222222-2222-4222-8222-222222222222';
  const permit = {
    attemptId: key, attemptToken: key, state: 'RUNNING', expiresAt: '2030-01-01T00:00:00.000Z',
    plan: { channelAccountId: account, collectorVersion: 'wing-inventory-v1', vendorId: 'A001',
      listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail', publicationRevision: '0', stage: 'basics' },
  };
  vi.mocked(apiClient.post).mockResolvedValue(permit);

  await expect(channelListingsApi.startCoupangCatalogCollection(
    account,
    { collectorVersion: 'wing-inventory-v1', stage: 'details' },
    key,
  )).rejects.toThrow('일치');
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
