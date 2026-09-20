import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sellpiaInventoryCollectionStatusApi } from '../sellpia-inventory-freshness-api';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  getParsed: vi.fn(),
  post: vi.fn(),
  uploadParsed: vi.fn(),
}));

vi.mock('../api-client', () => ({ apiClient }));

describe('sellpiaInventoryCollectionStatusApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the authoritative completed inventory basis independently of paged attempt history', async () => {
    const latestImport = {
      id: '33333333-3333-4333-8333-333333333333',
      fileName: 'authoritative.xls',
    };
    apiClient.getParsed.mockResolvedValueOnce({ latestImport });
    const api = sellpiaInventoryCollectionStatusApi as typeof sellpiaInventoryCollectionStatusApi & {
      getCurrentBasis?: () => Promise<unknown>;
    };

    expect(typeof api.getCurrentBasis).toBe('function');
    if (!api.getCurrentBasis) return;

    await expect(api.getCurrentBasis()).resolves.toBe(latestImport);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/inventory/sellpia-skus?page=1&limit=1',
      expect.anything(),
    );
  });

  it('confirms the fixed Sellpia source binding through the owner endpoint', async () => {
    const confirmed = {
      status: 'not_collected',
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: 'kiditem',
        confirmed: true,
      },
      requestedGeneration: '1',
      verifiedGeneration: '0',
      lastCompletedAttemptId: null,
      lastCompletedAt: null,
      lastAttemptId: null,
      activeSync: null,
      lastAttempt: null,
    };
    apiClient.post.mockResolvedValueOnce(confirmed);

    await expect(sellpiaInventoryCollectionStatusApi.confirmSourceBinding()).resolves.toEqual(confirmed);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-collection-status/source-binding',
      {
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        confirmed: true,
      },
    );
  });
});
