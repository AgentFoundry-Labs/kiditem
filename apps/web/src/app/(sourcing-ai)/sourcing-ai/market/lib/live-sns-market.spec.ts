import { describe, expect, it } from 'vitest';
import { buildLiveSnsMarketResult } from './live-sns-market';

const NOW = Date.parse('2026-07-12T00:00:00.000Z');

function video(overrides: Record<string, unknown>) {
  return {
    videoKey: 'v',
    title: '슬라임 영상',
    channelName: '채널',
    viewCount: 1000,
    likeCount: 10,
    commentCount: 2,
    keyword: '슬라임',
    publishedAt: '2026-07-10T00:00:00.000Z',
    thumbnailUrl: null,
    videoUrl: 'https://youtube.com/shorts/v',
    snapshotCount: 1,
    viewDelta: null,
    dailyViewGrowth: null,
    ...overrides,
  };
}

function response(items: Array<Record<string, unknown>>) {
  return { days: 7, businessDate: '2026-07-12', capturedAt: '2026-07-12T15:00:00.000Z', items } as never;
}

describe('buildLiveSnsMarketResult', () => {
  it('키워드로 그룹핑하고 조회수 상위 키워드가 SNS지수 100', () => {
    const result = buildLiveSnsMarketResult(
      response([
        video({ videoKey: 'a', keyword: '슬라임', viewCount: 5_000_000 }),
        video({ videoKey: 'b', keyword: '슬라임', viewCount: 3_000_000 }),
        video({ videoKey: 'c', keyword: '다꾸', viewCount: 10_000 }),
      ]),
      NOW,
    );
    expect(result.opportunities).toHaveLength(2);
    const top = result.opportunities[0];
    expect(top.keyword).toBe('슬라임');
    expect(top.trendRank).toBe(1);
    expect(top.score).toBeGreaterThanOrEqual(result.opportunities[1].score);
    expect(top.sources).toEqual(['YOUTUBE']);
    expect(top.snsEvidence?.videoCount).toBe(2);
    expect(top.snsEvidence?.totalViews).toBe(8_000_000);
    expect(top.snsEvidence?.topVideos[0].viewCount).toBe(5_000_000);
    expect(top.monthlySearches).toBeNull();
  });

  it('키워드 없는/조회수 null 영상은 제외', () => {
    const result = buildLiveSnsMarketResult(
      response([
        video({ videoKey: 'a', keyword: null }),
        video({ videoKey: 'b', keyword: '완구', viewCount: null }),
        video({ videoKey: 'c', keyword: '완구', viewCount: 500 }),
      ]),
      NOW,
    );
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].keyword).toBe('완구');
  });

  it('다일 실측 성장(viewDelta)이 있으면 모멘텀이 양수', () => {
    const result = buildLiveSnsMarketResult(
      response([
        video({ videoKey: 'a', keyword: '스퀴시', viewCount: 1_000_000, snapshotCount: 3, viewDelta: 200_000 }),
      ]),
      NOW,
    );
    expect(result.opportunities[0].momentum).toBeGreaterThan(0);
  });

  it('발행 7일 이내 조회 비중(freshShare)을 계산', () => {
    const result = buildLiveSnsMarketResult(
      response([
        video({ videoKey: 'fresh', keyword: '블록', viewCount: 800, publishedAt: '2026-07-10T00:00:00.000Z' }),
        video({ videoKey: 'old', keyword: '블록', viewCount: 200, publishedAt: '2026-06-01T00:00:00.000Z' }),
      ]),
      NOW,
    );
    // 800/(800+200) = 80%
    expect(result.opportunities[0].snsEvidence?.freshShare).toBe(80);
  });

  it('빈 응답은 빈 후보', () => {
    const result = buildLiveSnsMarketResult(response([]), NOW);
    expect(result.opportunities).toEqual([]);
    expect(result.source).toBe('youtube-shorts-live');
  });
});
