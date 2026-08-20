import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { fetchKeywordAnalysisSnapshot, keywordAnalysisInput } from './keyword-analysis-snapshot-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNullable: vi.fn(),
  },
}));

const getNullable = vi.mocked(apiClient.getNullable);

describe('fetchKeywordAnalysisSnapshot', () => {
  beforeEach(() => {
    getNullable.mockReset();
  });

  it('rejects a malformed persisted snapshot instead of exposing unvalidated provider data', async () => {
    getNullable.mockResolvedValue({
      version: 'naver-keyword-analysis/v1',
      generatedAt: '2026-08-14T00:00:00.000Z',
      input: keywordAnalysisInput('popular'),
      result: {
        popular: {
          source: 'naver-datalab-shopping-keyword-rank',
          timeUnit: 'date',
          startDate: '2026-08-01',
          endDate: '2026-08-14',
          device: null,
          gender: null,
          ages: [],
          generatedAt: '2026-08-14T00:00:00.000Z',
          boards: 'not-an-array',
        },
        related: null,
        autocomplete: [],
        trends: null,
      },
    } as never);

    await expect(fetchKeywordAnalysisSnapshot(keywordAnalysisInput('popular')))
      .rejects.toThrow();
  });

  it('preserves a missing snapshot as null', async () => {
    getNullable.mockResolvedValue(null);

    await expect(fetchKeywordAnalysisSnapshot(keywordAnalysisInput('popular')))
      .resolves.toBeNull();
  });
});
