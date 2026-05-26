import { BadGatewayException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NaverAutocompleteKeywordAdapter } from './naver-autocomplete-keyword.adapter';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('NaverAutocompleteKeywordAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NAVER_AUTOCOMPLETE_BASE_URL = 'https://ac.search.test';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('calls Naver autocomplete and normalizes nested keyword rows', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      query: ['슬라임'],
      items: [
        [
          ['슬라임카페', '0'],
          ['슬라임 만들기', '0'],
          ['슬라임카페', '0'],
          ['퍼티 슬라임', '0'],
        ],
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverAutocompleteKeywordAdapter();
    const result = await adapter.searchAutocompleteKeywords({
      keyword: ' 슬라임 ',
      maxResults: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://ac.search.test/nx/ac?');
    expect(String(url)).toContain('q=%EC%8A%AC%EB%9D%BC%EC%9E%84');
    expect((init?.headers as Record<string, string>)['User-Agent']).toContain('Mozilla');
    expect(result).toMatchObject({
      source: 'naver-search-autocomplete',
      keyword: '슬라임',
      items: [
        { keyword: '슬라임카페', rank: 1 },
        { keyword: '슬라임 만들기', rank: 2 },
        { keyword: '퍼티 슬라임', rank: 3 },
      ],
    });
  });

  it('returns an empty result for blank keywords', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverAutocompleteKeywordAdapter();
    const result = await adapter.searchAutocompleteKeywords({ keyword: '   ' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });

  it('wraps upstream autocomplete failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response('blocked', { status: 429 })) as typeof fetch;
    const adapter = new NaverAutocompleteKeywordAdapter();

    await expect(adapter.searchAutocompleteKeywords({ keyword: '슬라임' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
