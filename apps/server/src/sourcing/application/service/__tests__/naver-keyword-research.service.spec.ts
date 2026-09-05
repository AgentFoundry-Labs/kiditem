import { describe, expect, it, vi } from 'vitest';
import { NaverKeywordResearchService } from '../naver-keyword-research.service';

const generatedAt = '2026-09-06T00:00:00.000Z';
function setup() {
  const popular = { searchPopularKeywords: vi.fn(async () => ({ source: 'naver-datalab-shopping-keyword-rank',
    timeUnit: 'date', startDate: '2026-09-06', endDate: '2026-09-06', device: null, gender: null, ages: [], generatedAt,
    boards: [{ key: 'toys_dolls', label: '완구', cid: 1, categoryPath: '완구', date: '2026-09-06', datetime: '', range: 'daily', error: null,
      ranks: Array.from({ length: 16 }, (_, i) => ({ rank: i + 1, keyword: '키워드' + i, linkId: null, categories: [] })) }] })) };
  const keyword = { searchRelatedKeywords: vi.fn(async (input) => ({ source: 'naver-searchad-keywordstool',
    seedKeywords: input.seedKeywords, generatedAt, items: Array.from({ length: 45 }, (_, i) => ({ keyword: '연관' + i,
      monthlyPcSearchCount: 1, monthlyMobileSearchCount: 2, monthlyTotalSearchCount: 3, monthlyPcClickCount: null,
      monthlyMobileClickCount: null, monthlyTotalClickCount: null, monthlyPcClickRate: null, monthlyMobileClickRate: null,
      averageAdRank: null, competitionIndex: null, raw: { privateProviderField: true } })) })) };
  const autocomplete = { searchAutocompleteKeywords: vi.fn(async (input) => ({ source: 'naver-search-autocomplete',
    keyword: input.keyword, generatedAt, items: [] })) };
  const trend = { compareSearchTrends: vi.fn(async (input) => ({ source: 'naver-datalab-search-trend', keywords: input.keywords,
    startDate: '2026-08-06', endDate: '2026-09-06', timeUnit: 'date', generatedAt, items: [] })) };
  const attempt = { attemptId: 'attempt', attemptToken: 'token', planChecksum: 'checksum', targetKey: 'input', state: 'RUNNING' };
  const service = new NaverKeywordResearchService(keyword as never, trend as never, popular as never, autocomplete as never, {} as never,
    { beginAttempt: async () => ({ attempt, created: true }), completeAttempt: async () => ({ ...attempt, state: 'COMPLETE' }),
      failAttempt: async (input: { message: string }) => ({ ...attempt, state: 'FAILED', errorMessage: input.message }) } as never);
  return { service, keyword, trend, popular, autocomplete };
}

describe('Naver analysis provider characterization', () => {
  it('keeps popular → SearchAd → autocomplete → DataLab order and exact caps/options without provider raw fields', async () => {
    const { service, keyword, trend, popular, autocomplete } = setup();
    const result = await service.collectAnalysis({ organizationId: 'org', idempotencyKey: 'explicit',
      input: { action: 'trend_agent', gender: 'f', device: 'mo', age: '30', rankLimit: 16 } });
    expect(result.attempt.state).toBe('COMPLETE');
    expect(popular.searchPopularKeywords).toHaveBeenCalledWith({ timeUnit: 'date', gender: 'f', device: 'mo', ages: ['30'], limit: 16, signal: undefined });
    expect(keyword.searchRelatedKeywords.mock.calls[0][0]).toMatchObject({ seedKeywords: Array.from({ length: 12 }, (_, i) => '키워드' + i), maxResults: 100 });
    expect(autocomplete.searchAutocompleteKeywords).toHaveBeenCalledTimes(5);
    expect(autocomplete.searchAutocompleteKeywords.mock.calls[0][0]).toEqual({ keyword: '키워드0', maxResults: 30, signal: undefined });
    expect(trend.compareSearchTrends.mock.calls[0][0]).toMatchObject({ timeUnit: 'date', gender: 'f', device: 'mo', ages: ['5', '6'] });
    expect(trend.compareSearchTrends.mock.calls[0][0].keywords).toHaveLength(40);
    expect(popular.searchPopularKeywords.mock.invocationCallOrder[0]).toBeLessThan(keyword.searchRelatedKeywords.mock.invocationCallOrder[0]);
    expect(keyword.searchRelatedKeywords.mock.invocationCallOrder[0]).toBeLessThan(autocomplete.searchAutocompleteKeywords.mock.invocationCallOrder[0]);
    expect(autocomplete.searchAutocompleteKeywords.mock.invocationCallOrder[4]).toBeLessThan(trend.compareSearchTrends.mock.invocationCallOrder[0]);
    expect(result.payload?.result.related?.items[0]).not.toHaveProperty('raw');
  });

  it('propagates provider cancellation and never starts the following provider', async () => {
    const { service, keyword, popular } = setup();
    const controller = new AbortController();
    popular.searchPopularKeywords.mockImplementationOnce(async () => { controller.abort(new Error('cancelled')); return {} as never; });
    await expect(service.collectAnalysis({ organizationId: 'org', idempotencyKey: 'explicit', input: { action: 'trend_agent' }, signal: controller.signal })).rejects.toThrow('cancelled');
    expect(keyword.searchRelatedKeywords).not.toHaveBeenCalled();
  });
});
