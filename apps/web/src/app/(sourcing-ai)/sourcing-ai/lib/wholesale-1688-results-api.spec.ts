import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchWholesale1688Results,
  wholesale1688ResultsQueryKey,
} from './wholesale-1688-results-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn() },
}));

describe('wholesale 1688 persisted result API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses bounded canonical identities and parses a typed persisted snapshot', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        generatedAt: '2026-08-14T00:00:00.000Z',
        observations: [],
      }),
    );

    const input = {
      keywords: ['  슬라임  ', '积木玩具'],
      targetIds: ['product-1::'],
    };
    await expect(fetchWholesale1688Results(input)).resolves.toEqual({
      generatedAt: '2026-08-14T00:00:00.000Z',
      observations: [],
    });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/sourcing/wholesale/1688-results?keyword=%EC%8A%AC%EB%9D%BC%EC%9E%84&keyword=%E7%A7%AF%E6%9C%A8%E7%8E%A9%E5%85%B7&targetId=product-1%3A%3A',
      expect.anything(),
    );
    expect(wholesale1688ResultsQueryKey(input)).toEqual([
      'sourcing',
      'wholesale-1688-results',
      ['슬라임', '积木玩具'],
      ['product-1::'],
    ]);
  });

  it('rejects arbitrary operation JSON at the web boundary', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        generatedAt: null,
        observations: [],
        operationResult: { rows: [{ arbitrary: true }] },
      }),
    );

    await expect(fetchWholesale1688Results({
      keywords: ['슬라임'],
    })).rejects.toThrow();
  });
});
