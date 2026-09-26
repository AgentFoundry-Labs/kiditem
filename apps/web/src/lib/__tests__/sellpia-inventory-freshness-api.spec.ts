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
