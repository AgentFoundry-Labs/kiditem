import { describe, expect, it, vi } from 'vitest';
import { TrendQueryService } from '../trend-query.service';
import type { TrendCollectionRepositoryPort } from '../../port/out/repository/trend-collection.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-07-13T00:00:00.000Z');
const CAPTURED_AT = new Date('2026-07-13T05:40:00.000Z');
const EARLIER_CAPTURED_AT = new Date('2026-07-13T01:20:00.000Z');

function repositoryStub(): TrendCollectionRepositoryPort {
  return {
    listSeeds: vi.fn(async () => [
      {
        id: 'seed-sanrio',
        organizationId: ORGANIZATION_ID,
        keyword: '산리오',
        keywordCn: '三丽鸥',
        sources: ['shorts'],
        enabled: true,
        createdAt: BUSINESS_DATE,
        updatedAt: BUSINESS_DATE,
      },
    ]),
    upsertSeedByKeyword: vi.fn(),
    updateSeed: vi.fn(),
    deleteSeed: vi.fn(),
    upsertNaverKeywordSnapshots: vi.fn(async () => 0),
    replaceNaverPopularKeywordSnapshots: vi.fn(async () => 0),
    upsert1688HotProductSnapshots: vi.fn(async () => 0),
    upsertShortsSnapshots: vi.fn(async () => 0),
    upsertTiktokCcSnapshots: vi.fn(async () => 0),
    findNaverKeywordHistory: vi.fn(async () => []),
    findPopularKeywordHistory: vi.fn(async () => []),
    find1688HotHistory: vi.fn(async () => []),
    findTiktokCcHistory: vi.fn(async () => []),
    findShortsHistory: vi.fn(async () => [
      {
        businessDate: BUSINESS_DATE,
        capturedAt: EARLIER_CAPTURED_AT,
        videoKey: 'older-toy-capture',
        rank: 1,
        title: '오전 수집 스퀴시 장난감',
        channelName: '토이채널',
        viewCount: 700_000,
        likeCount: 9_000,
        commentCount: 300,
        keyword: '촉감·해소완구',
        publishedAt: BUSINESS_DATE,
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: BUSINESS_DATE,
        capturedAt: CAPTURED_AT,
        videoKey: 'sports',
        rank: 1,
        title: '월드컵 VVIP석에 앉으면 생기는 일',
        channelName: '스포츠채널',
        viewCount: 900_000,
        likeCount: 10_000,
        commentCount: 500,
        keyword: '스포츠',
        publishedAt: BUSINESS_DATE,
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: BUSINESS_DATE,
        capturedAt: CAPTURED_AT,
        videoKey: 'toy',
        rank: 2,
        title: '신상 스퀴시 장난감 뜯어보기',
        channelName: '토이채널',
        viewCount: 300_000,
        likeCount: 8_000,
        commentCount: 100,
        keyword: '완구/취미',
        publishedAt: BUSINESS_DATE,
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: BUSINESS_DATE,
        capturedAt: CAPTURED_AT,
        videoKey: 'custom-seed',
        rank: 3,
        title: '산리오 신상 랜덤깡',
        channelName: '캐릭터채널',
        viewCount: 200_000,
        likeCount: 7_000,
        commentCount: 90,
        keyword: '산리오',
        publishedAt: BUSINESS_DATE,
        thumbnailUrl: null,
        videoUrl: null,
      },
    ]),
  };
}

describe('TrendQueryService Shorts relevance', () => {
  it('hides previously stored general Shorts and reranks stationery/toy matches across the requested period', async () => {
    const service = new TrendQueryService(repositoryStub());

    const result = await service.getShorts(ORGANIZATION_ID, 7);

    expect(result.items.map((item) => item.videoKey)).toEqual([
      'older-toy-capture',
      'toy',
      'custom-seed',
    ]);
    expect(result.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(result.capturedAt).toBe(CAPTURED_AT.toISOString());
  });

  it('deduplicates videos across 30 days and ranks them by average daily view growth', async () => {
    const repository = repositoryStub();
    const firstSeenAt = new Date('2026-06-20T03:00:00.000Z');
    const lastSeenAt = new Date('2026-06-22T03:00:00.000Z');
    vi.mocked(repository.findShortsHistory).mockResolvedValue([
      {
        businessDate: new Date('2026-06-20T00:00:00.000Z'),
        capturedAt: firstSeenAt,
        videoKey: 'growing-toy',
        rank: 8,
        title: '신상 스퀴시 장난감',
        channelName: '토이채널',
        viewCount: 100_000,
        likeCount: 3_000,
        commentCount: 100,
        keyword: '스퀴시',
        publishedAt: new Date('2026-06-19T00:00:00.000Z'),
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: new Date('2026-06-22T00:00:00.000Z'),
        capturedAt: lastSeenAt,
        videoKey: 'growing-toy',
        rank: 2,
        title: '신상 스퀴시 장난감',
        channelName: '토이채널',
        viewCount: 250_000,
        likeCount: 8_000,
        commentCount: 350,
        keyword: '스퀴시',
        publishedAt: new Date('2026-06-19T00:00:00.000Z'),
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: new Date('2026-06-22T00:00:00.000Z'),
        capturedAt: lastSeenAt,
        videoKey: 'old-high-view-toy',
        rank: 1,
        title: '인기 장난감 모음',
        channelName: '완구채널',
        viewCount: 500_000,
        likeCount: 9_000,
        commentCount: 500,
        keyword: '완구',
        publishedAt: new Date('2026-06-01T00:00:00.000Z'),
        thumbnailUrl: null,
        videoUrl: null,
      },
    ]);
    const service = new TrendQueryService(repository);

    const result = await service.getShorts(ORGANIZATION_ID, 30);

    expect(repository.findShortsHistory).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      days: 30,
    });
    expect(result.items.map((item) => item.videoKey)).toEqual([
      'growing-toy',
      'old-high-view-toy',
    ]);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      snapshotCount: 2,
      viewDelta: 150_000,
      dailyViewGrowth: 75_000,
      firstSeenAt: firstSeenAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
    });
    expect(result.items[1]).toMatchObject({
      rank: 2,
      snapshotCount: 1,
      viewDelta: null,
    });
  });

  it('excludes videos published outside a 7-day window even when collected recently', async () => {
    const repository = repositoryStub();
    vi.mocked(repository.findShortsHistory).mockResolvedValue([
      {
        businessDate: BUSINESS_DATE,
        capturedAt: CAPTURED_AT,
        videoKey: 'recent-toy',
        rank: 1,
        title: '오늘의 장난감 신상품',
        channelName: '토이채널',
        viewCount: 10_000,
        likeCount: 500,
        commentCount: 30,
        keyword: '완구',
        publishedAt: new Date('2026-07-12T05:40:00.000Z'),
        thumbnailUrl: null,
        videoUrl: null,
      },
      {
        businessDate: BUSINESS_DATE,
        capturedAt: CAPTURED_AT,
        videoKey: 'old-toy',
        rank: 2,
        title: '예전 장난감 영상',
        channelName: '토이채널',
        viewCount: 900_000,
        likeCount: 10_000,
        commentCount: 500,
        keyword: '완구',
        publishedAt: new Date('2026-07-01T05:40:00.000Z'),
        thumbnailUrl: null,
        videoUrl: null,
      },
    ]);

    const result = await new TrendQueryService(repository).getShorts(ORGANIZATION_ID, 7);

    expect(result.items.map((item) => item.videoKey)).toEqual(['recent-toy']);
  });
});

describe('TrendQueryService TikTok Creative Center', () => {
  const PRIOR_DATE = new Date('2026-07-12T00:00:00.000Z');
  const LATEST_DATE = new Date('2026-07-13T00:00:00.000Z');

  function ttccRow(over: Record<string, unknown>) {
    return {
      businessDate: LATEST_DATE,
      capturedAt: CAPTURED_AT,
      region: 'US',
      trendType: 'hashtag',
      entityKey: '#squishy',
      rank: 1,
      label: 'squishy',
      industry: 'Toys',
      sourceKeyword: null,
      postCount: 1000,
      viewCount: 9_000_000_000,
      growthPct: 10,
      thumbnailUrl: null,
      sourceUrl: null,
      ...over,
    };
  }

  it('groups the latest capture by region, sorts by type then rank, and flags newly ranked entities', async () => {
    const repository = repositoryStub();
    vi.mocked(repository.findTiktokCcHistory).mockResolvedValue([
      // prior day — establishes that #squishy is NOT newly ranked
      ttccRow({ businessDate: PRIOR_DATE }),
      // latest day
      ttccRow({ trendType: 'product', entityKey: 'prod-1', rank: 1, label: 'squishy set' }),
      ttccRow({ entityKey: '#slime', rank: 2, label: 'slime' }),
      ttccRow({ entityKey: '#squishy', rank: 1 }),
      ttccRow({ region: 'KR', entityKey: '#다꾸', rank: 1, label: '다꾸' }),
    ] as never);

    const result = await new TrendQueryService(repository).getTiktokCc(ORGANIZATION_ID, 7);

    expect(result.businessDate).toBe('2026-07-13');
    expect(result.regions.map((r) => r.region)).toEqual(['KR', 'US']);
    const us = result.regions.find((r) => r.region === 'US')!;
    // hashtag rows sort before product rows; within hashtag, rank asc
    expect(us.items.map((i) => [i.trendType, i.entityKey])).toEqual([
      ['hashtag', '#squishy'],
      ['hashtag', '#slime'],
      ['product', 'prod-1'],
    ]);
    expect(us.items.find((i) => i.entityKey === '#squishy')!.newlyRanked).toBe(false);
    expect(us.items.find((i) => i.entityKey === '#slime')!.newlyRanked).toBe(true);
  });

  it('returns empty regions when no snapshots exist', async () => {
    const repository = repositoryStub();
    vi.mocked(repository.findTiktokCcHistory).mockResolvedValue([]);
    const result = await new TrendQueryService(repository).getTiktokCc(ORGANIZATION_ID, 7);
    expect(result).toEqual({ days: 7, businessDate: null, capturedAt: null, regions: [] });
  });
});
