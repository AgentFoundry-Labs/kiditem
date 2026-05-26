import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NaverSearchAdKeywordAdapter,
  createNaverSearchAdSignature,
} from './naver-search-ad-keyword.adapter';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('NaverSearchAdKeywordAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NAVER_SEARCHAD_API_KEY = 'api-key';
    process.env.NAVER_SEARCHAD_SECRET_KEY = 'secret-key';
    process.env.NAVER_SEARCHAD_CUSTOMER_ID = '123456';
    process.env.NAVER_SEARCHAD_BASE_URL = 'https://api.searchad.test';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('creates the SearchAd HMAC signature from timestamp, method, and URI', () => {
    const signature = createNaverSearchAdSignature('1710000000000', 'GET', '/keywordstool', 'secret-key');
    const expected = createHmac('sha256', 'secret-key')
      .update('1710000000000.GET./keywordstool', 'utf8')
      .digest('base64');

    expect(signature).toBe(expected);
  });

  it('calls keywordstool with server-side credentials and normalizes keyword rows', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      keywordList: [
        {
          relKeyword: '슬라임재료',
          monthlyPcQcCnt: '1,200',
          monthlyMobileQcCnt: '8,800',
          monthlyAvePcClkCnt: 12.5,
          monthlyAveMobileClkCnt: 99.5,
          monthlyAvePcCtr: 1.2,
          monthlyAveMobileCtr: 2.4,
          plAvgDepth: 8,
          compIdx: '중간',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverSearchAdKeywordAdapter();
    const result = await adapter.searchRelatedKeywords({
      seedKeywords: ['슬라임', '슬라임'],
      maxResults: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://api.searchad.test/keywordstool?');
    expect(String(url)).toContain('hintKeywords=%EC%8A%AC%EB%9D%BC%EC%9E%84');
    expect((init?.headers as Record<string, string>)['X-API-KEY']).toBe('api-key');
    expect((init?.headers as Record<string, string>)['X-Customer']).toBe('123456');
    expect((init?.headers as Record<string, string>)['X-Signature']).toBeTruthy();
    expect(result.seedKeywords).toEqual(['슬라임']);
    expect(result.items[0]).toMatchObject({
      keyword: '슬라임재료',
      monthlyTotalSearchCount: 10000,
      monthlyTotalClickCount: 112,
      competitionIndex: '중간',
    });
  });

  it('removes whitespace from seed keywords before calling keywordstool', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keywordList: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverSearchAdKeywordAdapter();
    const result = await adapter.searchRelatedKeywords({
      seedKeywords: [' 포켓몬 카드 ', '포켓몬카드'],
      maxResults: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('hintKeywords=%ED%8F%AC%EC%BC%93%EB%AA%AC%EC%B9%B4%EB%93%9C');
    expect(String(url)).not.toContain('%20');
    expect(result.seedKeywords).toEqual(['포켓몬카드']);
  });

  it('fails clearly when SearchAd credentials are missing', async () => {
    delete process.env.NAVER_SEARCHAD_API_KEY;
    const adapter = new NaverSearchAdKeywordAdapter();

    await expect(adapter.searchRelatedKeywords({ seedKeywords: ['슬라임'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('wraps upstream SearchAd failures without exposing credentials', async () => {
    globalThis.fetch = vi.fn(async () => new Response('invalid signature', { status: 403 })) as typeof fetch;
    const adapter = new NaverSearchAdKeywordAdapter();

    await expect(adapter.searchRelatedKeywords({ seedKeywords: ['슬라임'] })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
