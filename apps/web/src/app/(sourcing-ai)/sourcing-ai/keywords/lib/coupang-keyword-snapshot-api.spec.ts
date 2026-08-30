import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchCoupangKeywordSuggestionSnapshot,
  keywordSuggestionSnapshotQueryKey,
} from './coupang-keyword-snapshot-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn() },
}));

describe('Coupang keyword suggestion snapshot API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes one keyword and parses the typed persisted owner snapshot', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        keyword: '슬라임',
        generatedAt: '2026-08-14T00:00:00.000Z',
        sourceKey: 'coupang.keyword_suggestion',
        schemaVersion: 'coupang-keyword-suggestion/v1',
        items: [],
        productNameTokens: [],
      }),
    );

    await expect(fetchCoupangKeywordSuggestionSnapshot('  슬라임  ')).resolves.toMatchObject({
      keyword: '슬라임',
      items: [],
    });
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/sourcing/workspace/keyword-suggestions?keyword=%EC%8A%AC%EB%9D%BC%EC%9E%84',
      expect.anything(),
    );
    expect(keywordSuggestionSnapshotQueryKey('  슬라임  ')).toEqual([
      'sourcing',
      'keyword-suggestions',
      '슬라임',
    ]);
  });

  it('rejects raw operation JSON at the browser API boundary', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (_path, schema) =>
      schema.parse({
        keyword: '슬라임',
        generatedAt: null,
        sourceKey: 'coupang.keyword_suggestion',
        schemaVersion: 'coupang-keyword-suggestion/v1',
        items: [],
        productNameTokens: [],
        operationResult: { rows: [{ secret: true }] },
      }),
    );

    await expect(fetchCoupangKeywordSuggestionSnapshot('슬라임')).rejects.toThrow();
  });
});
