import { afterEach, describe, expect, it, vi } from 'vitest';
import { NaverDatalabPopularKeywordAdapter } from './naver-datalab-popular-keyword.adapter';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

describe('NaverDatalabPopularKeywordAdapter', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls DataLab shopping keyword rank with demographic filters', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: null,
      statusCode: 200,
      returnCode: 0,
      date: '',
      datetime: '',
      range: '2026.04.20. ~ 2026.05.20.',
      ranks: [
        { rank: 1, keyword: '포켓몬카드', linkId: '포켓몬카드' },
        { rank: 2, keyword: '레고', linkId: '레고' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;
    process.env.NAVER_DATALAB_WEB_BASE_URL = 'https://datalab.test';

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      timeUnit: 'date',
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      gender: 'f',
      ages: ['30'],
      device: 'mo',
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://datalab.test/shoppingInsight/getCategoryKeywordRank.naver');
    expect(String(init?.body)).toContain('cid=50000142');
    expect(String(init?.body)).toContain('gender=f');
    expect(String(init?.body)).toContain('age=30');
    expect(String(init?.body)).toContain('device=mo');
    expect(result.boards[0]).toMatchObject({
      key: 'toys_dolls',
      label: '완구/인형',
      cid: 50000142,
      range: '2026.04.20. ~ 2026.05.20.',
      ranks: [
        { rank: 1, keyword: '포켓몬카드', categories: ['완구/인형'] },
        { rank: 2, keyword: '레고', categories: ['완구/인형'] },
      ],
    });
  });

  it('uses the lightweight unfiltered DataLab keyword rank endpoint for the default board', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
      message: null,
      statusCode: 200,
      returnCode: 0,
      date: '2026/05/09',
      datetime: '2026.05.09.(토)',
      range: '',
      ranks: [
        { rank: 1, keyword: '포켓몬카드', linkId: '포켓몬카드' },
        { rank: 2, keyword: '레고', linkId: '레고' },
      ],
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['all_categories'],
      timeUnit: 'date',
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/shoppingInsight/getKeywordRank.naver?');
    expect(String(url)).toContain('cid=50000005');
    expect(result.boards[0]).toMatchObject({
      key: 'all_categories',
      label: '필터 없음 TOP',
      cid: 50000005,
      ranks: [
        { rank: 1, keyword: '포켓몬카드', categories: ['필터 없음 TOP'] },
        { rank: 2, keyword: '레고', categories: ['필터 없음 TOP'] },
      ],
    });
  });

  it.each([
    // 'date'(일간)는 최근 단일일이 네이버 집계 지연으로 비어, 최근 7일 범위로 조회한다.
    ['date', 'startDate=2026-05-15', 'endDate=2026-05-21', '2026.05.15. ~ 2026.05.21.'],
    ['week', 'startDate=2026-05-15', 'endDate=2026-05-21', '2026.05.15. ~ 2026.05.21.'],
    ['month', 'startDate=2026-04-21', 'endDate=2026-05-21', '2026.04.21. ~ 2026.05.21.'],
  ] as const)('uses the expected default %s range for category keyword ranks', async (timeUnit, startParam, endParam, displayRange) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T03:00:00.000Z'));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: null,
      statusCode: 200,
      returnCode: 0,
      ranks: [
        { rank: 1, keyword: '포켓몬카드', linkId: '포켓몬카드' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      timeUnit,
      limit: 10,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toContain(startParam);
    expect(String(init?.body)).toContain(endParam);
    expect(result.startDate).toBe(startParam.replace('startDate=', ''));
    expect(result.endDate).toBe(endParam.replace('endDate=', ''));
    expect(result.boards[0].range).toBe(displayRange);
  });

  it('returns partial boards when a DataLab board is rate limited', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      if (init?.method === 'POST') {
        return new Response('too many requests', { status: 429 });
      }
      return new Response(JSON.stringify([{
        message: null,
        statusCode: 200,
        returnCode: 0,
        ranks: [{ rank: 1, keyword: '포켓몬카드', linkId: '포켓몬카드' }],
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new NaverDatalabPopularKeywordAdapter();
    const result = await adapter.searchPopularKeywords({
      boardKeys: ['all_categories', 'toys_dolls'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
      limit: 10,
    });

    expect(result.boards).toHaveLength(2);
    expect(result.boards[0].ranks).toHaveLength(1);
    expect(result.boards[1]).toMatchObject({
      key: 'toys_dolls',
      ranks: [],
    });
    expect(result.boards[1].error).toContain('429');
  });

  it('keeps non-json DataLab responses isolated to the failed board', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>blocked</html>', { status: 200 })) as typeof fetch;
    const adapter = new NaverDatalabPopularKeywordAdapter();

    const result = await adapter.searchPopularKeywords({
      boardKeys: ['toys_dolls'],
      startDate: '2026-04-20',
      endDate: '2026-05-20',
    });

    expect(result.boards[0]).toMatchObject({
      key: 'toys_dolls',
      ranks: [],
    });
    expect(result.boards[0].error).toContain('JSON이 아닌 응답');
  });
});
