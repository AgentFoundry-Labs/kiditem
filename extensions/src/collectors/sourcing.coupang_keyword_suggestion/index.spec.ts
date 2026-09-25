import { describe, expect, it } from 'vitest';
import { sourcingCoupangKeywordSuggestionCollector } from './index';

describe('sourcing.coupang_keyword_suggestion collector (KID-360)', () => {
  it('yields one keyword_suggestions document in the old completion shape', async () => {
    const chunks = [];
    for await (const chunk of sourcingCoupangKeywordSuggestionCollector.collect({ keyword: '연필', maxResults: 1 }, {
      keywordSuggestions: async () => ({
        items: [{ rank: 1, keyword: '연필깎이', source: 'coupang-autocomplete' }, { rank: 2, keyword: '색연필', source: 'coupang-search-dom' }],
        productNameTokens: [{ keyword: '아동', count: 3 }],
        warnings: ['fallback'],
      }),
    }, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ chunkKind: 'keyword_suggestions', payload: [{
      keyword: '연필', items: [{ rank: 1, keyword: '연필깎이' }], productNameTokens: [{ keyword: '아동', count: 3 }], warnings: ['fallback'],
    }] });
    expect(typeof (chunks[0].payload[0] as { capturedAt: string }).capturedAt).toBe('string');
  });
});
