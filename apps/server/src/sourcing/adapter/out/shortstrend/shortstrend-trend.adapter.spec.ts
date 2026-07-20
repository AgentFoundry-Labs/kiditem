import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortstrendTrendAdapter } from './shortstrend-trend.adapter';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

const LATEST_COLLECTED_AT = '2026-07-13T04:01:30.818+00:00';

// shortstrend Supabase `youtube_videos` 테이블의 실제 페이로드 모양을 캡처한 표본이다.
// 라이브는 조회수/좋아요를 숫자로 주지만, 파서가 한글 수치 문자열도 견디도록
// 마지막 행은 '1.2만' 같은 문자열 형태로 넣어 방어 경로까지 검증한다.
const SAMPLE_ROWS = [
  {
    video_id: 'qCu3QVlj2aA',
    title: '뽀로로 장난감 언박싱 #뽀로로 #kids',
    channel_title: '키즈토이',
    channel_id: 'UCabc',
    thumbnail_url: 'https://i.ytimg.com/vi/qCu3QVlj2aA/mqdefault.jpg',
    view_count: 400666,
    like_count: 12000,
    comment_count: 75,
    category_name: '완구/취미',
    published_at: '2026-07-12T16:25:20+00:00',
    collected_at: LATEST_COLLECTED_AT,
    trend_score: 636584,
  },
  {
    video_id: 'QPfyKN9ISu8',
    title: '이상형도 그냥 다 공개되는 원이',
    channel_title: '리센느',
    channel_id: 'UCdef',
    thumbnail_url: 'https://i.ytimg.com/vi/QPfyKN9ISu8/mqdefault.jpg',
    view_count: 453574,
    like_count: 8800,
    comment_count: 210,
    category_name: '음악',
    published_at: '2026-07-12T18:00:00+00:00',
    collected_at: '2026-07-13T04:01:25.801+00:00',
    trend_score: 570431,
  },
  {
    video_id: 'pvj2NS5fPus',
    title: '오래된 수공구 정비하는 방법 #diy',
    channel_title: '목공방',
    channel_id: 'UCghi',
    thumbnail_url: 'https://i.ytimg.com/vi/pvj2NS5fPus/mqdefault.jpg',
    view_count: '1.2만',
    like_count: '3,456',
    comment_count: '1.5천',
    category_name: '일상/로그',
    published_at: '2026-07-12T09:00:00+00:00',
    collected_at: '2026-07-13T04:01:19.035+00:00',
    trend_score: 322992,
  },
  {
    video_id: 'qCu3QVlj2aA',
    title: '뽀로로 장난감 언박싱 (재수집)',
    channel_title: '키즈토이',
    channel_id: 'UCabc',
    thumbnail_url: 'https://i.ytimg.com/vi/qCu3QVlj2aA/mqdefault.jpg',
    view_count: 401000,
    like_count: 12010,
    comment_count: 76,
    category_name: '완구/취미',
    published_at: '2026-07-12T16:25:20+00:00',
    collected_at: '2026-07-13T04:01:10.000+00:00',
    trend_score: 100,
  },
];

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function mockTwoStepFetch(rows: unknown[] = SAMPLE_ROWS): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('select=collected_at') && url.includes('limit=1')) {
      return jsonResponse([{ collected_at: LATEST_COLLECTED_AT }]);
    }
    return jsonResponse(rows);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ShortstrendTrendAdapter', () => {
  beforeEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('keeps only stationery/toy videos from the recent ranked pool', async () => {
    const fetchMock = mockTwoStepFetch();
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ limit: 50 });

    expect(result.source).toBe('shortstrend');
    expect(result.error).toBeUndefined();
    // 최신 수집시각 요청 + 최근 48시간 풀 조회 요청 두 번.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // publishable key가 apikey 헤더로 전송되는지 확인.
    const [, batchInit] = fetchMock.mock.calls[1];
    expect((batchInit?.headers as Record<string, string>).apikey).toContain('sb_publishable_');

    // 중복 video_id(재수집 행)는 최신 행만 남기고 제거된다.
    expect(result.items).toHaveLength(1);
    expect(result.items.map((item) => item.rank)).toEqual([1]);

    const top = result.items[0];
    expect(top).toMatchObject({
      videoKey: 'qCu3QVlj2aA',
      channelName: '키즈토이',
      viewCount: 400666,
      likeCount: 12000,
      commentCount: 75,
      videoUrl: 'https://www.youtube.com/shorts/qCu3QVlj2aA',
      thumbnailUrl: 'https://i.ytimg.com/vi/qCu3QVlj2aA/mqdefault.jpg',
      rank: 1,
      keyword: '완구',
    });
    expect(top.publishedAt).toBe('2026-07-12T16:25:20.000Z');
  });

  it('paginates past the Supabase 1,000-row response cap before applying niche relevance', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      video_id: `general-${index}`,
      title: `일반 뉴스 영상 ${index}`,
      category_name: '뉴스',
      collected_at: LATEST_COLLECTED_AT,
      trend_score: 10_000 - index,
    }));
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.searchParams.get('select') === 'collected_at') {
        return jsonResponse([{ collected_at: LATEST_COLLECTED_AT }]);
      }
      if (url.searchParams.get('offset') === '0') return jsonResponse(firstPage);
      return jsonResponse([{
        video_id: 'page-two-figure',
        title: '어떤 배우의 피규어일까요?',
        category_name: '교육',
        collected_at: '2026-07-12T12:01:30.000+00:00',
        trend_score: 900,
      }]);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new ShortstrendTrendAdapter().fetchTrending({ limit: 50 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondPoolUrl = new URL(String(fetchMock.mock.calls[2][0]));
    expect(secondPoolUrl.searchParams.get('offset')).toBe('1000');
    expect(secondPoolUrl.searchParams.get('limit')).toBe('1000');
    expect(result.items).toEqual([
      expect.objectContaining({
        videoKey: 'page-two-figure',
        keyword: '인형·피규어',
        rank: 1,
      }),
    ]);
  });

  it('parses Korean number formats for relevant video counts', async () => {
    mockTwoStepFetch([
      {
        ...SAMPLE_ROWS[2],
        title: '스퀴시 장난감 조회수 테스트',
      },
    ]);
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({});
    const diy = result.items.find((item) => item.videoKey === 'pvj2NS5fPus');

    expect(diy).toBeDefined();
    expect(diy?.viewCount).toBe(12000); // '1.2만'
    expect(diy?.likeCount).toBe(3456); // '3,456'
    expect(diy?.commentCount).toBe(1500); // '1.5천'
  });

  it('filters to seed-matching items and tags the matched keyword', async () => {
    mockTwoStepFetch();
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ keywords: ['뽀로로'], limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      videoKey: 'qCu3QVlj2aA',
      keyword: '뽀로로',
      rank: 1,
    });
  });

  it('does not fall back to general trending when no seed or category term matches', async () => {
    mockTwoStepFetch(SAMPLE_ROWS.slice(1, 3));
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ keywords: ['존재하지않는키워드'], limit: 2 });

    expect(result.items).toEqual([]);
  });

  it('degrades gracefully when the network request throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.error).toContain('network down');
    expect(result.source).toBe('shortstrend');
  });

  it('degrades gracefully on a non-200 upstream response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.error).toContain('429');
  });

  it('returns an empty result without error when the table is empty', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const adapter = new ShortstrendTrendAdapter();

    const result = await adapter.fetchTrending({ limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('uses the official YouTube API when a server key is configured', async () => {
    process.env.YOUTUBE_API_KEY = 'test-youtube-key';
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search')) {
        return jsonResponse({
          items: [{
            id: { videoId: 'youtube-direct' },
            snippet: {
              title: '검색어로 찾은 신상품',
              channelTitle: '문구채널',
              publishedAt: '2026-07-13T03:00:00.000Z',
              thumbnails: { medium: { url: 'https://img.example/direct.jpg' } },
            },
          }],
        });
      }
      return jsonResponse({
        items: [{
          id: 'youtube-direct',
          statistics: { viewCount: '9000', likeCount: '400', commentCount: '50' },
          contentDetails: { duration: 'PT50S' },
        }],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new ShortstrendTrendAdapter().fetchTrending({
      keywords: ['문구'],
      limit: 20,
      publishedWithinDays: 30,
    });

    expect(result.source).toBe('youtube');
    expect(result.error).toBeUndefined();
    expect(result.items).toEqual([
      expect.objectContaining({
        videoKey: 'youtube-direct',
        keyword: '문구',
        rank: 1,
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
