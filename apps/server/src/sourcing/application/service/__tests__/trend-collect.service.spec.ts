import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectService } from '../trend-collect.service';
import type {
  NaverDatalabPopularKeywordPort,
  NaverDatalabTrendPort,
  NaverKeywordResearchPort,
} from '../../port/out/provider/naver-keyword-research.port';
import type { Sourcing1688KeywordSearchPort } from '../../port/out/provider/1688-keyword-search.port';
import type { ShortstrendTrendPort } from '../../port/out/provider/shortstrend-trend.port';
import type {
  TrendCollectionRepositoryPort,
  TrendSeedRow,
} from '../../port/out/repository/trend-collection.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function seed(partial: Partial<TrendSeedRow> & { keyword: string }): TrendSeedRow {
  return {
    id: `seed-${partial.keyword}`,
    organizationId: ORGANIZATION_ID,
    keyword: partial.keyword,
    keywordCn: partial.keywordCn ?? null,
    sources: partial.sources ?? ['naver', 'shorts', '1688'],
    enabled: partial.enabled ?? true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

function buildPorts() {
  const keywordResearch: NaverKeywordResearchPort = {
    getStatus: vi.fn(() => ({ configured: true, requiredEnv: [] })),
    searchRelatedKeywords: vi.fn(async () => ({
      source: 'naver-searchad-keywordstool' as const,
      seedKeywords: [],
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [],
    })),
  };
  const datalabTrend: NaverDatalabTrendPort = {
    getStatus: vi.fn(() => ({ configured: true, requiredEnv: [] })),
    compareSearchTrends: vi.fn(async () => ({
      source: 'naver-datalab-search-trend' as const,
      keywords: [],
      startDate: '2026-06-13',
      endDate: '2026-07-13',
      timeUnit: 'date' as const,
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [],
    })),
  };
  const popularKeywords: NaverDatalabPopularKeywordPort = {
    searchPopularKeywords: vi.fn(async () => ({
      source: 'naver-datalab-shopping-keyword-rank' as const,
      timeUnit: 'date' as const,
      startDate: '2026-07-13',
      endDate: '2026-07-13',
      device: null,
      gender: null,
      ages: [],
      generatedAt: '2026-07-13T00:00:00.000Z',
      boards: [],
    })),
  };
  const keywordSearch1688: Sourcing1688KeywordSearchPort = {
    getStatus: vi.fn(() => ({ configured: true, baseUrl: 'https://h5api.m.1688.com' })),
    searchByKeyword: vi.fn(async (input) => ({ keyword: input.keyword, page: 1, items: [] })),
  };
  const shortstrend: ShortstrendTrendPort = {
    fetchTrending: vi.fn(async () => ({
      source: 'shortstrend' as const,
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [],
    })),
  };
  const repository: TrendCollectionRepositoryPort = {
    listSeeds: vi.fn(async () => []),
    upsertSeedByKeyword: vi.fn(),
    updateSeed: vi.fn(),
    deleteSeed: vi.fn(),
    upsertNaverKeywordSnapshots: vi.fn(async (rows) => rows.length),
    replaceNaverPopularKeywordSnapshots: vi.fn(async (rows) => rows.length),
    upsert1688HotProductSnapshots: vi.fn(async (rows) => rows.length),
    upsertShortsSnapshots: vi.fn(async (rows) => rows.length),
    upsertTiktokCcSnapshots: vi.fn(async (rows) => rows.length),
    findNaverKeywordHistory: vi.fn(async () => []),
    findPopularKeywordHistory: vi.fn(async () => []),
    find1688HotHistory: vi.fn(async () => []),
    findShortsHistory: vi.fn(async () => []),
    findTiktokCcHistory: vi.fn(async () => []),
  };

  const service = new TrendCollectService(
    keywordResearch,
    datalabTrend,
    popularKeywords,
    keywordSearch1688,
    shortstrend,
    repository,
  );

  return { service, keywordResearch, datalabTrend, popularKeywords, keywordSearch1688, shortstrend, repository };
}

describe('TrendCollectService', () => {
  let ports: ReturnType<typeof buildPorts>;

  beforeEach(() => {
    ports = buildPorts();
  });

  it('returns default and enabled custom 1688 targets with Chinese query keywords', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '키링', keywordCn: '儿童挂件', sources: ['1688'] }),
      seed({ keyword: '비활성', keywordCn: '不应出现', sources: ['1688'], enabled: false }),
      seed({ keyword: '쇼츠 전용', keywordCn: '短视频', sources: ['shorts'] }),
    ]);

    const targets = await ports.service.list1688Targets(ORGANIZATION_ID);

    expect(targets[0]).toEqual({ label: '키링', keyword: '儿童挂件' });
    expect(targets).toEqual(expect.arrayContaining([
      { label: '문구', keyword: '文具' },
      { label: '완구', keyword: '儿童玩具' },
    ]));
    expect(targets).not.toContainEqual(expect.objectContaining({ label: '비활성' }));
    expect(targets).not.toContainEqual(expect.objectContaining({ label: '쇼츠 전용' }));
  });

  it('caps browser collection targets to the extension batch contract', async () => {
    ports.repository.listSeeds = vi.fn(async () =>
      Array.from({ length: 15 }, (_, index) =>
        seed({
          keyword: `사용자 시드 ${index}`,
          keywordCn: `自定义关键词${index}`,
          sources: ['1688'],
        }),
      ),
    );

    const targets = await ports.service.list1688Targets(ORGANIZATION_ID);

    expect(targets).toHaveLength(20);
    expect(targets[0]).toEqual({ label: '사용자 시드 0', keyword: '自定义关键词0' });
  });

  it('ingests one organization-scoped 1688 extension batch with shared capture time and offer dedupe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T15:30:00.000Z'));
    try {
      const result = await ports.service.ingest1688ExtensionResults(ORGANIZATION_ID, {
        runId: 'run-1688-1',
        keywords: [
          {
            keyword: ' 文具 ',
            items: [
              {
                offerId: ' offer-a ',
                title: ' 젤펜 ',
                priceCny: 0.81,
                monthlySales: 2_000,
                tradeScore: 88,
                rank: 2,
              },
            ],
          },
          {
            keyword: '儿童笔袋',
            items: [
              { offerId: 'offer-a', title: 'duplicate', rank: 1 },
              { offerId: 'offer-b', title: ' 필통 ', monthlySales: 900 },
            ],
          },
        ],
        errors: [{ keyword: ' 儿童贴纸 ', message: ' slider required ' }],
      });

      expect(result).toEqual({
        businessDate: '2026-07-14',
        collected: 2,
        errors: [{ keyword: '儿童贴纸', message: 'slider required' }],
      });
      const rows = (ports.repository.upsert1688HotProductSnapshots as any).mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: new Date('2026-07-14T00:00:00.000Z'),
        offerId: 'offer-a',
        sourceKeyword: '文具',
        rank: 2,
        title: '젤펜',
        tradeScore: '88',
      }));
      expect(rows[1]).toEqual(expect.objectContaining({
        offerId: 'offer-b',
        sourceKeyword: '儿童笔袋',
        rank: 2,
        title: '필통',
      }));
      expect(rows[0].capturedAt).toBe(rows[1].capturedAt);
      expect(rows[0].businessDate).toBe(rows[1].businessDate);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns only enabled seeds tagged tiktok-cc as creative-center targets', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', keywordCn: '史莱姆', sources: ['tiktok-cc', 'shorts'] }),
      seed({ keyword: '스퀴시', sources: ['naver'] }),
      seed({ keyword: '비활성', sources: ['tiktok-cc'], enabled: false }),
    ]);

    const targets = await ports.service.listTiktokCcTargets(ORGANIZATION_ID);

    expect(targets).toEqual([{ label: '슬라임', keyword: '슬라임' }]);
  });

  it('ingests one region-scoped tiktok-cc batch with shared capture time and type+entity dedupe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T15:30:00.000Z'));
    try {
      const result = await ports.service.ingestTiktokCcResults(ORGANIZATION_ID, {
        runId: 'run-ttcc-1',
        region: 'us',
        items: [
          {
            trendType: 'hashtag',
            entityKey: ' #squishy ',
            label: ' squishy ',
            industry: 'Toys',
            viewCount: 9_000_000_000,
            growthPct: 42.5,
            rank: 3,
          },
          { trendType: 'hashtag', entityKey: '#squishy', label: 'duplicate' },
          { trendType: 'product', entityKey: 'prod-1', label: ' Mini squishy set ', sourceKeyword: '스퀴시' },
        ],
        errors: [{ target: ' KR/top-products ', message: ' region blocked ' }],
      });

      expect(result).toEqual({
        businessDate: '2026-07-14',
        collected: 2,
        errors: [{ target: 'KR/top-products', message: 'region blocked' }],
      });
      const rows = (ports.repository.upsertTiktokCcSnapshots as any).mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: new Date('2026-07-14T00:00:00.000Z'),
        region: 'US',
        trendType: 'hashtag',
        entityKey: '#squishy',
        label: 'squishy',
        rank: 3,
        viewCount: 9_000_000_000,
        growthPct: 42.5,
      }));
      expect(rows[1]).toEqual(expect.objectContaining({
        trendType: 'product',
        entityKey: 'prod-1',
        sourceKeyword: '스퀴시',
      }));
      expect(rows[0].capturedAt).toBe(rows[1].capturedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps SearchAd metrics per seed and merges DataLab trend ratio/delta', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', sources: ['naver'] }),
      seed({ keyword: '말랑이', sources: ['naver'] }),
    ]);
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async () => ({
      source: 'naver-searchad-keywordstool',
      seedKeywords: ['슬라임', '말랑이'],
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [
        {
          keyword: '슬라임',
          monthlyPcSearchCount: 2000,
          monthlyMobileSearchCount: 10000,
          monthlyTotalSearchCount: 12000,
          monthlyPcClickCount: null,
          monthlyMobileClickCount: null,
          monthlyTotalClickCount: null,
          monthlyPcClickRate: null,
          monthlyMobileClickRate: null,
          averageAdRank: 1.4,
          competitionIndex: '높음',
          raw: {},
        },
      ],
    }));
    ports.datalabTrend.compareSearchTrends = vi.fn(async () => ({
      source: 'naver-datalab-search-trend',
      keywords: ['슬라임', '말랑이'],
      startDate: '2026-06-13',
      endDate: '2026-07-13',
      timeUnit: 'date',
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [
        {
          keyword: '슬라임',
          latestRatio: 87.6,
          previousAverageRatio: 60,
          peakRatio: 100,
          trendDelta: 12.4,
          trendRate: 0.2,
          data: [],
        },
      ],
    }));

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver']);

    expect(result.results).toEqual([{ source: 'naver', ok: true, collected: 2 }]);
    const rows = (ports.repository.upsertNaverKeywordSnapshots as any).mock.calls[0][0];
    const slime = rows.find((row: any) => row.keyword === '슬라임');
    expect(slime).toEqual(
      expect.objectContaining({
        keyword: '슬라임',
        monthlyTotalSearchCount: 12000,
        monthlyPcSearchCount: 2000,
        monthlyMobileSearchCount: 10000,
        competitionIndex: '높음',
        averageAdRank: 1,
        trendRatio: 88,
        trendDelta: 12,
      }),
    );
    const soft = rows.find((row: any) => row.keyword === '말랑이');
    expect(soft).toEqual(
      expect.objectContaining({ monthlyTotalSearchCount: null, trendRatio: null }),
    );
  });

  it('collects popular boards seed-independently, one row per board×rank', async () => {
    ports.repository.listSeeds = vi.fn(async () => []);
    ports.popularKeywords.searchPopularKeywords = vi.fn(async () => ({
      source: 'naver-datalab-shopping-keyword-rank',
      timeUnit: 'date',
      startDate: '2026-07-13',
      endDate: '2026-07-13',
      device: null,
      gender: null,
      ages: [],
      generatedAt: '2026-07-13T00:00:00.000Z',
      boards: [
        {
          key: 'toys_dolls',
          label: '완구/인형',
          cid: 12345,
          categoryPath: '완구',
          date: '2026-07-13',
          datetime: '2026-07-13T00:00:00',
          range: 'daily',
          ranks: [
            { rank: 1, keyword: '레고', linkId: 'a', categories: [] },
            { rank: 2, keyword: '블록', linkId: 'b', categories: [] },
          ],
          error: null,
        },
      ],
    }));

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver']);

    // 인기보드 2행 저장 + 그 키워드(레고·블록)의 검색광고 볼륨 스냅샷 2행 = 4.
    expect(result.results).toEqual([{ source: 'naver', ok: true, collected: 4 }]);
    const rows = (ports.repository.replaceNaverPopularKeywordSnapshots as any).mock.calls[0][0];
    expect(rows).toHaveLength(2);
    // 인기보드 키워드도 검색광고 월검색량 조회 대상에 포함된다(신규 키워드 검색량 조인용).
    const volumeRows = (ports.repository.upsertNaverKeywordSnapshots as any).mock.calls[0][0];
    expect(volumeRows.map((row: any) => row.keyword)).toEqual(['레고', '블록']);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        boardKey: 'toys_dolls',
        boardLabel: '완구/인형',
        cid: '12345',
        rank: 1,
        keyword: '레고',
        linkId: 'a',
      }),
    );
  });

  it('ranks 1688 offers by monthly sales descending within a seed result set', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', keywordCn: '史莱姆', sources: ['1688'] }),
    ]);
    ports.keywordSearch1688.searchByKeyword = vi.fn(async (input) => ({
      keyword: input.keyword,
      page: 1,
      items: [
        { offerId: 'A', title: 'a', priceCny: 10, sourceUrl: 'u', imageUrl: null, monthlySales: 100, tradeScore: null, repurchaseRate: null, supplierName: null, score: 40 },
        { offerId: 'B', title: 'b', priceCny: 12, sourceUrl: 'u', imageUrl: null, monthlySales: 900, tradeScore: null, repurchaseRate: null, supplierName: null, score: 40 },
        { offerId: 'C', title: 'c', priceCny: 11, sourceUrl: 'u', imageUrl: null, monthlySales: 500, tradeScore: null, repurchaseRate: null, supplierName: null, score: 40 },
      ],
    }));

    const result = await ports.service.collect(ORGANIZATION_ID, ['1688']);

    expect(result.results).toEqual([{ source: '1688', ok: true, collected: 3 }]);
    expect(ports.keywordSearch1688.searchByKeyword).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '史莱姆', maxResults: 20 }),
    );
    const rows = (ports.repository.upsert1688HotProductSnapshots as any).mock.calls[0][0];
    expect(rows.find((row: any) => row.offerId === 'B')).toEqual(
      expect.objectContaining({ rank: 1, sourceKeyword: '슬라임' }),
    );
    expect(rows.find((row: any) => row.offerId === 'C').rank).toBe(2);
    expect(rows.find((row: any) => row.offerId === 'A').rank).toBe(3);
  });

  it('uses stationery/toy baseline seeds for 1688 and Shorts when no user seed exists', async () => {
    ports.repository.listSeeds = vi.fn(async () => []);
    ports.keywordSearch1688.searchByKeyword = vi.fn(async (input) => ({
      keyword: input.keyword,
      page: 1,
      items: [
        {
          offerId: `offer-${input.keyword}`,
          title: `${input.keyword} 신상품`,
          priceCny: 8,
          sourceUrl: 'https://detail.1688.com/offer/1.html',
          imageUrl: null,
          monthlySales: 100,
          tradeScore: null,
          repurchaseRate: null,
          supplierName: null,
          score: 50,
        },
      ],
    }));

    const result = await ports.service.collect(ORGANIZATION_ID, ['1688', 'shorts']);

    // 기본 완구·문구 시드 10 + 도우인 트렌드 큐레이션 시드 8 = 1688 은 18개 키워드 수집.
    expect(result.results).toEqual([
      { source: '1688', ok: true, collected: 18 },
      { source: 'shorts', ok: true, collected: 0 },
    ]);
    expect(ports.keywordSearch1688.searchByKeyword).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '文具' }),
    );
    // 도우인 트렌드 키워드(谷子=굿즈)는 1688 수집에만 추가로 태워진다.
    expect(ports.keywordSearch1688.searchByKeyword).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '谷子' }),
    );
    // shorts 는 도우인 시드의 영향을 받지 않는다(1688 전용 baseline).
    expect(ports.shortstrend.fetchTrending).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: expect.arrayContaining(['문구', '완구', '슬라임']),
        limit: 50,
        publishedWithinDays: 30,
      }),
    );
    expect(ports.shortstrend.fetchTrending).not.toHaveBeenCalledWith(
      expect.objectContaining({ keywords: expect.arrayContaining(['굿즈']) }),
    );
  });

  it('stops the 1688 baseline batch after a login or verification blocker', async () => {
    ports.repository.listSeeds = vi.fn(async () => []);
    ports.keywordSearch1688.searchByKeyword = vi.fn(async () => {
      throw new Error('1688 로그인/슬라이더 검증이 필요합니다.');
    });

    const result = await ports.service.collect(ORGANIZATION_ID, ['1688']);

    expect(ports.keywordSearch1688.searchByKeyword).toHaveBeenCalledTimes(1);
    expect(result.results[0]).toEqual(expect.objectContaining({
      source: '1688',
      ok: false,
      collected: 0,
      error: expect.stringContaining('로그인/슬라이더'),
    }));
  });

  it('degrades gracefully when shorts port returns an error, without aborting other sources', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', keywordCn: '史莱姆', sources: ['naver', '1688', 'shorts'] }),
    ]);
    ports.keywordSearch1688.searchByKeyword = vi.fn(async (input) => ({
      keyword: input.keyword,
      page: 1,
      items: [
        { offerId: 'B', title: 'b', priceCny: 12, sourceUrl: 'u', imageUrl: null, monthlySales: 900, tradeScore: null, repurchaseRate: null, supplierName: null, score: 40 },
      ],
    }));
    ports.shortstrend.fetchTrending = vi.fn(async () => ({
      source: 'shortstrend',
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [],
      error: 'shortstrend unreachable',
    }));

    const result = await ports.service.collect(ORGANIZATION_ID);

    expect(result.results).toEqual([
      { source: 'naver', ok: true, collected: 1 },
      { source: '1688', ok: true, collected: 1 },
      { source: 'shorts', ok: false, collected: 0, error: 'shortstrend unreachable' },
    ]);
    expect(ports.repository.upsertShortsSnapshots).not.toHaveBeenCalled();
    expect(ports.repository.upsert1688HotProductSnapshots).toHaveBeenCalled();
  });

  it('isolates a failing source so the others still collect', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', keywordCn: '史莱姆', sources: ['naver', '1688', 'shorts'] }),
    ]);
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async () => {
      throw new Error('SearchAd 401');
    });
    ports.popularKeywords.searchPopularKeywords = vi.fn(async () => {
      throw new Error('DataLab down');
    });
    ports.keywordSearch1688.searchByKeyword = vi.fn(async (input) => ({
      keyword: input.keyword,
      page: 1,
      items: [
        { offerId: 'B', title: 'b', priceCny: 12, sourceUrl: 'u', imageUrl: null, monthlySales: 900, tradeScore: null, repurchaseRate: null, supplierName: null, score: 40 },
      ],
    }));
    ports.shortstrend.fetchTrending = vi.fn(async () => ({
      source: 'shortstrend',
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [
        {
          videoKey: 'vid-1',
          title: '슬라임 쇼츠',
          channelName: '채널',
          viewCount: 12000,
          likeCount: 300,
          commentCount: 20,
          keyword: '슬라임',
          publishedAt: '2026-07-12T00:00:00.000Z',
          thumbnailUrl: null,
          videoUrl: 'https://youtu.be/vid-1',
          rank: 1,
        },
      ],
    }));

    const result = await ports.service.collect(ORGANIZATION_ID);

    const naver = result.results.find((r) => r.source === 'naver');
    const one688 = result.results.find((r) => r.source === '1688');
    const shorts = result.results.find((r) => r.source === 'shorts');
    expect(naver).toEqual(expect.objectContaining({ source: 'naver', ok: false, collected: 0 }));
    expect(one688).toEqual({ source: '1688', ok: true, collected: 1 });
    expect(shorts).toEqual({ source: 'shorts', ok: true, collected: 1 });
    expect(ports.repository.upsertShortsSnapshots).toHaveBeenCalled();
  });
});
