import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NaverDatalabPopularKeywordAdapter } from './naver-datalab-popular-keyword.adapter';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function shoppingInsightResponse(
  entries: Array<{ keyword: string; ratios: number[] }>,
  startDate = '2026-04-20',
  endDate = '2026-05-20',
): Response {
  return new Response(JSON.stringify({
    startDate,
    endDate,
    timeUnit: 'date',
    results: entries.map(({ keyword, ratios }) => ({
      title: keyword,
      keyword: [keyword],
      data: ratios.map((ratio, index) => ({
        period: `2026-05-${String(index + 18).padStart(2, '0')}`,
        ratio,
      })),
    })),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('NaverDatalabPopularKeywordAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NAVER_API_HUB_CLIENT_ID = 'client-id';
    process.env.NAVER_API_HUB_CLIENT_SECRET = 'client-secret';
    process.env.NAVER_API_HUB_BASE_URL = 'https://api-hub.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ranks supplied candidates by summed official Shopping Insight click ratios', async () => {
    const fetchMock = vi.fn(async () => shoppingInsightResponse([
      { keyword: '포켓몬카드', ratios: [50, 100] },
      { keyword: '레고', ratios: [20, 30] },
    ]));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      keywords: [' 포켓몬카드 ', '레고', '레고'],
      timeUnit: 'date',
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      gender: 'f',
      ages: ['30'],
      device: 'mo',
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api-hub.test/shopping/v1/category/keywords');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-NCP-APIGW-API-KEY-ID': 'client-id',
      'X-NCP-APIGW-API-KEY': 'client-secret',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      timeUnit: 'date',
      category: '50000142',
      keyword: [
        { name: '포켓몬카드', param: ['포켓몬카드'] },
        { name: '레고', param: ['레고'] },
      ],
      device: 'mo',
      gender: 'f',
      ages: ['30'],
    });
    expect(result.boards[0]).toMatchObject({
      key: 'toys_dolls',
      label: '완구/인형',
      cid: 50000142,
      date: '2026-05-20',
      range: '2026.04.20. ~ 2026.05.20.',
      ranks: [
        { rank: 1, keyword: '포켓몬카드', linkId: null, categories: ['완구/인형'] },
        { rank: 2, keyword: '레고', linkId: null, categories: ['완구/인형'] },
      ],
    });
  });

  it('batches the board candidate pool into official five-keyword requests', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return shoppingInsightResponse(
        request.keyword.map((entry: { name: string }, index: number) => ({
          keyword: entry.name,
          ratios: [index + 1],
        })),
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      limit: 20,
    });

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(firstRequest.keyword).toEqual([
      { name: '레고', param: ['레고'] },
      { name: '포켓몬카드', param: ['포켓몬카드'] },
      { name: '캐릭터인형', param: ['캐릭터인형'] },
      { name: '역할놀이', param: ['역할놀이'] },
      { name: '유아블록', param: ['유아블록'] },
    ]);

    // 5 + 4 + 4 + 4 + 3 = 20개 후보를 5개 배치로 나눠 호출한다.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls.slice(1)) {
      const request = JSON.parse(String(call[1]?.body));
      expect(request.keyword.length).toBeLessThanOrEqual(5);
      expect(request.keyword[0]).toEqual({ name: '레고', param: ['레고'] });
    }

    // 표시 개수(limit)만큼 실제로 채워져야 한다. 5개로 잘리면 버튼이 먹지 않는다.
    expect(result.boards[0].ranks).toHaveLength(20);
    expect(result.boards[0].ranks.map((rank) => rank.rank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(new Set(result.boards[0].ranks.map((rank) => rank.keyword)).size).toBe(20);
  });

  it('honours the requested display limit instead of clamping to five', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return shoppingInsightResponse(
        request.keyword.map((entry: { name: string }, index: number) => ({
          keyword: entry.name,
          ratios: [index + 1],
        })),
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      limit: 10,
    });

    expect(result.boards[0].ranks).toHaveLength(10);
  });

  it('rescales later batches by the shared anchor so cross-batch scores stay comparable', async () => {
    // 배치별 ratio 는 요청 안에서 100 으로 정규화된다. 앵커('레고')가 1번 배치에서 100,
    // 2번 배치에서 50 이면 2번 배치 점수는 2배로 재척도돼야 1번 배치와 비교 가능하다.
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const names = request.keyword.map((entry: { name: string }) => entry.name);
      if (names.includes('캐릭터인형')) {
        return shoppingInsightResponse([
          { keyword: '레고', ratios: [100] },
          { keyword: '포켓몬카드', ratios: [40] },
          { keyword: '캐릭터인형', ratios: [30] },
          { keyword: '역할놀이', ratios: [20] },
          { keyword: '유아블록', ratios: [10] },
        ]);
      }
      if (names.includes('인형')) {
        return shoppingInsightResponse([
          { keyword: '레고', ratios: [50] },
          // 재척도 후 30 * (100/50) = 60 -> 포켓몬카드(40)보다 위로 올라와야 한다.
          { keyword: '인형', ratios: [30] },
          { keyword: names[2], ratios: [5] },
          { keyword: names[3], ratios: [5] },
          { keyword: names[4], ratios: [5] },
        ]);
      }
      // 나머지 배치는 앵커만 살아 있고 새 후보는 모두 낮은 점수.
      return shoppingInsightResponse([
        { keyword: '레고', ratios: [50] },
        { keyword: names[1], ratios: [2] },
        { keyword: names[2], ratios: [2] },
        { keyword: names[3], ratios: [2] },
        { keyword: names[4], ratios: [2] },
      ]);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      limit: 10,
    });

    const ranks = result.boards[0].ranks;
    expect(ranks[0].keyword).toBe('레고');
    // '인형'은 2번 배치의 첫 새 후보다. 재척도가 없으면 30 < 40 이라 포켓몬카드 아래에 남는다.
    expect(ranks[1].keyword).toBe('인형');
    expect(ranks[2].keyword).toBe('포켓몬카드');
  });

  it.each([
    ['date', '2026-05-15', '2026-05-21', '2026.05.15. ~ 2026.05.21.'],
    ['week', '2026-05-15', '2026-05-21', '2026.05.15. ~ 2026.05.21.'],
    ['month', '2026-04-21', '2026-05-21', '2026.04.21. ~ 2026.05.21.'],
  ] as const)('uses the expected default %s range for Shopping Insight', async (
    timeUnit,
    startDate,
    endDate,
    displayRange,
  ) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T03:00:00.000Z'));
    const fetchMock = vi.fn(async () => shoppingInsightResponse([{ keyword: '레고', ratios: [100] }]));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      keywords: ['레고'],
      timeUnit,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ startDate, endDate, timeUnit });
    expect(result.startDate).toBe(startDate);
    expect(result.endDate).toBe(endDate);
    expect(result.boards[0].range).toBe(displayRange);
  });

  it('returns partial boards when an official Shopping Insight request is rate limited', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.category === '50000142') {
        return new Response(JSON.stringify({ errMsg: 'Too Many Requests' }), { status: 429 });
      }
      return shoppingInsightResponse([{ keyword: '레고', ratios: [100] }]);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['all_categories', 'toys_dolls'],
      keywords: ['레고'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
    });

    expect(result.boards).toHaveLength(2);
    expect(result.boards[0].ranks).toHaveLength(1);
    expect(result.boards[1]).toMatchObject({ key: 'toys_dolls', ranks: [] });
    expect(result.boards[1].error).toContain('429');
  });

  it('keeps non-json Shopping Insight responses isolated to the failed board', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>blocked</html>', { status: 200 })) as typeof fetch;
    const adapter = new NaverDatalabPopularKeywordAdapter();

    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      keywords: ['레고'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
    });

    expect(result.boards[0]).toMatchObject({ key: 'toys_dolls', ranks: [] });
    expect(result.boards[0].error).toContain('JSON이 아닌 응답');
  });

  it('requires API HUB credentials and never falls back to legacy DataLab env', async () => {
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    process.env.NAVER_DATALAB_CLIENT_ID = 'legacy-client-id';
    process.env.NAVER_DATALAB_CLIENT_SECRET = 'legacy-client-secret';
    const adapter = new NaverDatalabPopularKeywordAdapter();

    await expect(adapter.searchPopularKeywords({ boardKeys: ['toys_dolls'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
