import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYoutubeShortsTrending } from './youtube-data-shorts.client';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchYoutubeShortsTrending', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('searches the requested period, enriches statistics, and ranks by view velocity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search')) {
        return jsonResponse({
          items: [
            {
              id: { videoId: 'fresh-video' },
              snippet: {
                title: '오늘 공개한 책상 위 신상품',
                channelTitle: '문구연구소',
                publishedAt: '2026-07-13T10:00:00.000Z',
                thumbnails: { medium: { url: 'https://img.example/fresh.jpg' } },
              },
            },
            {
              id: { videoId: 'older-video' },
              snippet: {
                title: '이번 주 인기 아이템',
                channelTitle: '토이채널',
                publishedAt: '2026-07-10T12:00:00.000Z',
                thumbnails: { medium: { url: 'https://img.example/older.jpg' } },
              },
            },
          ],
        });
      }
      return jsonResponse({
        items: [
          {
            id: 'fresh-video',
            statistics: { viewCount: '12000', likeCount: '800', commentCount: '90' },
            contentDetails: { duration: 'PT45S' },
          },
          {
            id: 'older-video',
            statistics: { viewCount: '30000', likeCount: '900', commentCount: '100' },
            contentDetails: { duration: 'PT2M10S' },
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchYoutubeShortsTrending({
      apiKey: 'test-key',
      keywords: ['문구'],
      publishedWithinDays: 30,
      limit: 20,
    });

    expect(result.map((item) => item.videoKey)).toEqual(['fresh-video', 'older-video']);
    expect(result[0]).toMatchObject({
      rank: 1,
      keyword: '문구',
      channelName: '문구연구소',
      viewCount: 12000,
      likeCount: 800,
      commentCount: 90,
      videoUrl: 'https://www.youtube.com/shorts/fresh-video',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.searchParams.get('publishedAfter')).toBe('2026-06-13T12:00:00.000Z');
    expect(searchUrl.searchParams.get('videoDuration')).toBe('short');
    expect(searchUrl.searchParams.get('key')).toBe('test-key');
  });

  it('deduplicates the same video found by multiple keywords', async () => {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search')) {
        return jsonResponse({
          items: [{
            id: { videoId: 'same-video' },
            snippet: {
              title: '랜덤 신상품',
              channelTitle: '리뷰채널',
              publishedAt: '2026-07-13T10:00:00.000Z',
              thumbnails: {},
            },
          }],
        });
      }
      return jsonResponse({
        items: [{
          id: 'same-video',
          statistics: { viewCount: '1000' },
          contentDetails: { duration: 'PT30S' },
        }],
      });
    }) as unknown as typeof fetch;

    const result = await fetchYoutubeShortsTrending({
      apiKey: 'test-key',
      keywords: ['문구', '완구'],
      publishedWithinDays: 7,
      limit: 20,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ videoKey: 'same-video', keyword: '문구' });
  });
});
