import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleTrendsRssAdapter } from './google-trends-rss.adapter';

const ORIGINAL_FETCH = globalThis.fetch;

function rss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
      <channel>${items}</channel>
    </rss>`;
}

function rssItem(input: {
  title: string;
  traffic?: string;
  pubDate?: string;
  link?: string;
  newsItems?: string;
}): string {
  return `<item>
    <title>${input.title}</title>
    ${input.traffic ? `<ht:approx_traffic>${input.traffic}</ht:approx_traffic>` : ''}
    ${input.pubDate ? `<pubDate>${input.pubDate}</pubDate>` : ''}
    ${input.link ? `<link>${input.link}</link>` : ''}
    ${input.newsItems ?? ''}
  </item>`;
}

function newsItem(input: { title?: string; url?: string; source?: string }): string {
  return `<ht:news_item>
    ${input.title ? `<ht:news_item_title>${input.title}</ht:news_item_title>` : ''}
    ${input.url ? `<ht:news_item_url>${input.url}</ht:news_item_url>` : ''}
    ${input.source ? `<ht:news_item_source>${input.source}</ht:news_item_source>` : ''}
  </ht:news_item>`;
}

function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' },
  });
}

describe('GoogleTrendsRssAdapter', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('normalizes the official KR feed, traffic, publication date, and multiple news items', async () => {
    const xml = rss(rssItem({
      title: '산리오 캐릭터 필통',
      traffic: '10K+',
      pubDate: 'Tue, 14 Jul 2026 01:00:00 GMT',
      newsItems: [
        newsItem({
          title: '새 학기 캐릭터 문구 인기',
          url: 'https://news.example/items/1#fragment',
          source: '문구신문',
        }),
        newsItem({
          title: '산리오 필통 검색 급증',
          url: 'https://media.example/trends/1',
          source: '트렌드뉴스',
        }),
      ].join(''),
    }));
    const fetchMock = vi.fn(async () => xmlResponse(xml));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new GoogleTrendsRssAdapter().fetchTrending({
      seedKeywords: ['산리오'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://trends.google.com/trending/rss?geo=KR');
    expect(init).toMatchObject({ method: 'GET', redirect: 'follow' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result.source).toBe('google-trends-rss');
    expect(result.items).toEqual([
      expect.objectContaining({
        externalId: expect.stringMatching(/^gtr_[a-f0-9]{24}$/),
        title: '산리오 캐릭터 필통',
        rawTitle: '산리오 캐릭터 필통',
        approximateTraffic: 10_000,
        approximateTrafficLabel: '10K+',
        publishedAt: '2026-07-14T01:00:00.000Z',
        sourceUrl: 'https://news.example/items/1',
        relevanceLabel: '산리오',
        newsItems: [
          {
            title: '새 학기 캐릭터 문구 인기',
            url: 'https://news.example/items/1',
            source: '문구신문',
          },
          {
            title: '산리오 필통 검색 급증',
            url: 'https://media.example/trends/1',
            source: '트렌드뉴스',
          },
        ],
      }),
    ]);
    expect(result.items[0].raw.title).toBe('산리오 캐릭터 필통');
  });

  it('normalizes a singular news item and falls back to the item link', async () => {
    const xml = rss(rssItem({
      title: '일반 경제 뉴스',
      traffic: '500+',
      pubDate: 'not-a-date',
      link: 'https://trends.example/topic',
      newsItems: newsItem({ title: '경제 기사', source: '경제신문' }),
    }));
    globalThis.fetch = vi.fn(async () => xmlResponse(xml)) as unknown as typeof fetch;

    const result = await new GoogleTrendsRssAdapter().fetchTrending({});

    expect(result.items[0]).toMatchObject({
      title: '일반 경제 뉴스',
      approximateTraffic: 500,
      publishedAt: null,
      sourceUrl: 'https://trends.example/topic',
      relevanceLabel: null,
      newsItems: [{ title: '경제 기사', url: null, source: '경제신문' }],
    });
  });

  it('deduplicates by stable source URL before applying the hard cap of 100', async () => {
    const duplicateUrl = 'https://news.example/duplicate';
    const duplicateItems = [
      rssItem({
        title: '첫 번째 제목',
        pubDate: 'Tue, 14 Jul 2026 01:00:00 GMT',
        newsItems: newsItem({ url: duplicateUrl }),
      }),
      rssItem({
        title: '수정된 제목',
        pubDate: 'Wed, 15 Jul 2026 01:00:00 GMT',
        newsItems: newsItem({ url: duplicateUrl }),
      }),
    ];
    const uniqueItems = Array.from({ length: 105 }, (_, index) => rssItem({
      title: `고유 트렌드 ${index}`,
      pubDate: 'Tue, 14 Jul 2026 01:00:00 GMT',
      newsItems: newsItem({ url: `https://news.example/unique/${index}` }),
    }));
    globalThis.fetch = vi.fn(async () => xmlResponse(rss([
      ...duplicateItems,
      ...uniqueItems,
    ].join('')))) as unknown as typeof fetch;

    const result = await new GoogleTrendsRssAdapter().fetchTrending({ limit: 200 });

    expect(result.items).toHaveLength(100);
    expect(result.items.filter((item) => item.sourceUrl === duplicateUrl)).toHaveLength(1);
    expect(new Set(result.items.map((item) => item.externalId)).size).toBe(100);
  });

  it('wraps a non-2xx response without leaking its response body', async () => {
    globalThis.fetch = vi.fn(async () => xmlResponse('upstream-secret-token', 503)) as unknown as typeof fetch;

    const request = new GoogleTrendsRssAdapter().fetchTrending({});

    await expect(request).rejects.toBeInstanceOf(BadGatewayException);
    await expect(request).rejects.toThrow('HTTP 503');
    await expect(request).rejects.not.toThrow('upstream-secret-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed XML explicitly', async () => {
    globalThis.fetch = vi.fn(async () => xmlResponse(
      '<rss><channel><item><title>깨진 XML</title></channel></rss>',
    )) as unknown as typeof fetch;

    await expect(new GoogleTrendsRssAdapter().fetchTrending({})).rejects.toThrow(
      '유효한 XML',
    );
  });

  it('aborts the only request after 15 seconds and returns a sanitized timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('internal upstream detail', 'AbortError'));
      }, { once: true });
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const request = new GoogleTrendsRssAdapter().fetchTrending({});
    const assertion = expect(request).rejects.toBeInstanceOf(GatewayTimeoutException);
    await vi.advanceTimersByTimeAsync(15_000);

    await assertion;
    await expect(request).rejects.not.toThrow('internal upstream detail');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
