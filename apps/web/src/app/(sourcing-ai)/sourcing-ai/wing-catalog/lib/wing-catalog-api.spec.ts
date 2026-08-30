import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchWingCatalogSnapshot,
  wingCatalogSnapshotQueryKey,
} from './wing-catalog-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn() },
}));

describe('Wing catalog snapshot API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses one normalized keyword query key and parses persisted owner data', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        keyword: '슬라임',
        generatedAt: '2026-08-14T00:00:00.000Z',
        items: [],
        rejectedCount: 0,
      }),
    );

    await expect(fetchWingCatalogSnapshot(' 슬라임 ')).resolves.toMatchObject({
      keyword: '슬라임',
      items: [],
    });
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/sourcing/workspace/wing-catalog?keyword=%EC%8A%AC%EB%9D%BC%EC%9E%84',
      expect.anything(),
    );
    expect(wingCatalogSnapshotQueryKey(' 슬라임 ')).toEqual([
      'sourcing',
      'wing-catalog',
      '슬라임',
    ]);
  });

  it('rejects arbitrary persisted JSON at the API boundary', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        keyword: '슬라임',
        generatedAt: '2026-08-14T00:00:00.000Z',
        items: [],
        rejectedCount: 0,
        operationResult: { rawRows: [{ secret: true }] },
      }),
    );

    await expect(fetchWingCatalogSnapshot('슬라임')).rejects.toThrow();
  });
});
