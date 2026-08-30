import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectService } from '../trend-collect.service';
import type {
  NaverDatalabPopularKeywordPort,
  NaverDatalabTrendPort,
  NaverKeywordResearchPort,
} from '../../port/out/provider/naver-keyword-research.port';
import type { ShortstrendTrendPort } from '../../port/out/provider/shortstrend-trend.port';
import type {
  TrendCollectionRepositoryPort,
  TrendSeedRow,
} from '../../port/out/repository/trend-collection.repository.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
    findNaverKeywordHistory: vi.fn(async () => []),
    findPopularKeywordHistory: vi.fn(async () => []),
    find1688HotHistory: vi.fn(async () => []),
    findShortsHistory: vi.fn(async () => []),
    findTiktokCcHistory: vi.fn(async () => []),
  };
  const collectionOutputs: Array<{ typedRecords: Array<{ kind: string; row: unknown }> }> = [];
  const collectionCoordinator = {
    execute: vi.fn(async (input: any, collector: any) => {
      const output = await collector({
        permit: {
          runId: '00000000-0000-4000-8000-000000000010',
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          leaseToken: '00000000-0000-4000-8000-000000000011',
          generation: 1,
          entitlementVersionId: '00000000-0000-4000-8000-000000000012',
          entitlementVersionHash: 'a'.repeat(64),
          leaseExpiresAt: new Date('2026-07-13T01:00:00.000Z'),
        },
        checkpoint: async () => undefined,
      });
      collectionOutputs.push(output);
      return {
        kind: 'committed' as const,
        runId: input.idempotencyKey,
        acceptedCount: Math.max(0, output.discoveredCount - output.rejectedCount),
        duplicateCount: 0,
        staleDiscardedCount: 0,
      };
    }),
  } as unknown as SourcingCollectionCoordinator;

  const service = new TrendCollectService(
    keywordResearch,
    datalabTrend,
    popularKeywords,
    shortstrend,
    repository,
    collectionCoordinator,
  );

  return {
    service,
    keywordResearch,
    datalabTrend,
    popularKeywords,
    shortstrend,
    repository,
    collectionCoordinator,
    collectionOutputs,
  };
}

function typedRows(
  ports: ReturnType<typeof buildPorts>,
  kind: string,
): Array<Record<string, unknown>> {
  return ports.collectionOutputs.flatMap((output) =>
    output.typedRecords
      .filter((record) => record.kind === kind)
      .map((record) => record.row as Record<string, unknown>),
  );
}

describe('TrendCollectService', () => {
  let ports: ReturnType<typeof buildPorts>;

  beforeEach(() => {
    ports = buildPorts();
  });

  it('stops before loading seeds when the operation signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('operation_attempt_fence_lost'));

    await expect(ports.service.collect(
      ORGANIZATION_ID,
      ['naver'],
      null,
      'operation-run-1',
      controller.signal,
    )).rejects.toThrow('operation_attempt_fence_lost');
    expect(ports.repository.listSeeds).not.toHaveBeenCalled();
  });

  it('passes the signal to a Naver batch and stops before the next chunk after abort', async () => {
    const controller = new AbortController();
    ports.repository.listSeeds = vi.fn(async () =>
      Array.from({ length: 6 }, (_, index) =>
        seed({ keyword: `키워드-${index}`, sources: ['naver'] }),
      ),
    );
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async () => {
      controller.abort(new Error('operation_attempt_fence_lost'));
      return {
        source: 'naver-searchad-keywordstool' as const,
        seedKeywords: [],
        generatedAt: '2026-07-13T00:00:00.000Z',
        items: [],
      };
    });

    await expect(ports.service.collect(
      ORGANIZATION_ID,
      ['naver'],
      null,
      'operation-run-1',
      controller.signal,
    )).rejects.toThrow('operation_attempt_fence_lost');

    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(1);
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('maps Naver chunks with concurrency exactly two while preserving keyword order and checkpoints', async () => {
    const keywords = Array.from({ length: 11 }, (_, index) => `키워드-${index}`);
    ports.repository.listSeeds = vi.fn(async () => keywords.map((keyword) =>
      seed({ keyword, sources: ['naver'] })));
    const gates = [deferred(), deferred(), deferred()];
    let active = 0;
    let maxActive = 0;
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async (input) => {
      const callIndex = vi.mocked(ports.keywordResearch.searchRelatedKeywords).mock.calls.length - 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates[callIndex].promise;
      active -= 1;
      return {
        source: 'naver-searchad-keywordstool' as const,
        seedKeywords: input.seedKeywords,
        generatedAt: '2026-07-13T00:00:00.000Z',
        items: input.seedKeywords.map((keyword, index) => ({
          keyword,
          monthlyPcSearchCount: index,
          monthlyMobileSearchCount: 100 + index,
          monthlyTotalSearchCount: 100 + index * 2,
          monthlyPcClickCount: null,
          monthlyMobileClickCount: null,
          monthlyTotalClickCount: null,
          monthlyPcClickRate: null,
          monthlyMobileClickRate: null,
          averageAdRank: null,
          competitionIndex: null,
          raw: {},
        })),
      };
    });
    const checkpoint = vi.fn().mockResolvedValue(undefined);

    const collection = ports.service.collectSource(
      ORGANIZATION_ID,
      'naver',
      null,
      'operation-run-1',
      { signal: new AbortController().signal, checkpoint },
    );
    await vi.waitFor(() => {
      expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(2);
    });
    expect(maxActive).toBe(2);
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ seedKeywords: keywords.slice(0, 5) }),
    );
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ seedKeywords: keywords.slice(5, 10) }),
    );

    gates[0].resolve();
    await vi.waitFor(() => {
      expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(3);
    });
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ seedKeywords: keywords.slice(10) }),
    );
    gates[1].resolve();
    gates[2].resolve();

    await expect(collection).resolves.toMatchObject({
      businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: 'naver',
      ok: true,
      collected: 11,
    });
    expect(maxActive).toBe(2);
    expect(typedRows(ports, 'naver_keyword').map((row) => row.keyword)).toEqual(keywords);
    expect(checkpoint).toHaveBeenCalledWith({
      stage: 'collecting_naver_searchad',
      progressCurrent: 0,
      progressTotal: 3,
    });
    expect(checkpoint).toHaveBeenCalledWith({
      stage: 'collecting_naver_searchad',
      progressCurrent: 2,
      progressTotal: 3,
    });
  });

  it('does not start a third Naver chunk after either concurrent unit loses its signal', async () => {
    const controller = new AbortController();
    ports.repository.listSeeds = vi.fn(async () =>
      Array.from({ length: 11 }, (_, index) =>
        seed({ keyword: `키워드-${index}`, sources: ['naver'] }),
      ),
    );
    const gates = [deferred(), deferred()];
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async (input) => {
      const callIndex = vi.mocked(ports.keywordResearch.searchRelatedKeywords).mock.calls.length - 1;
      await gates[callIndex].promise;
      if (callIndex === 0) {
        controller.abort(new Error('operation_attempt_fence_lost'));
      }
      return {
        source: 'naver-searchad-keywordstool' as const,
        seedKeywords: input.seedKeywords,
        generatedAt: '2026-07-13T00:00:00.000Z',
        items: [],
      };
    });

    const collection = ports.service.collectSource(
      ORGANIZATION_ID,
      'naver',
      null,
      'operation-run-1',
      { signal: controller.signal, checkpoint: vi.fn().mockResolvedValue(undefined) },
    );
    const rejected = expect(collection).rejects.toThrow('operation_attempt_fence_lost');
    await vi.waitFor(() => {
      expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(2);
    });
    gates[0].resolve();
    await vi.waitFor(() => expect(controller.signal.aborted).toBe(true));
    gates[1].resolve();

    await rejected;
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(2);
  });

  it('does not swallow an abort at the DataLab enrichment boundary', async () => {
    const controller = new AbortController();
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', sources: ['naver'] }),
    ]);
    ports.datalabTrend.compareSearchTrends = vi.fn(async () => {
      controller.abort(new Error('operation_attempt_fence_lost'));
      return {
        source: 'naver-datalab-search-trend' as const,
        keywords: ['슬라임'],
        startDate: '2026-06-13',
        endDate: '2026-07-13',
        timeUnit: 'date' as const,
        generatedAt: '2026-07-13T00:00:00.000Z',
        items: [],
      };
    });

    await expect(ports.service.collect(
      ORGANIZATION_ID,
      ['naver'],
      null,
      'operation-run-1',
      controller.signal,
    )).rejects.toThrow('operation_attempt_fence_lost');
  });

  it('passes the signal to the Shorts batch and stops after provider abort', async () => {
    const controller = new AbortController();
    ports.shortstrend.fetchTrending = vi.fn(async () => {
      controller.abort(new Error('operation_attempt_fence_lost'));
      return {
        source: 'shortstrend' as const,
        generatedAt: '2026-07-13T00:00:00.000Z',
        items: [],
      };
    });

    await expect(ports.service.collect(
      ORGANIZATION_ID,
      ['shorts'],
      null,
      'operation-run-1',
      controller.signal,
    )).rejects.toThrow('operation_attempt_fence_lost');

    expect(ports.shortstrend.fetchTrending).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
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
        collected: 3,
        errors: [{ keyword: '儿童贴纸', message: 'slider required' }],
      });
      const rows = typedRows(ports, 'offer_1688_keyword_observation');
      expect(rows).toHaveLength(3);
      expect(rows.find((row) => row.offerId === 'offer-a' && row.sourceKeyword === '文具')).toEqual(expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: new Date('2026-07-14T00:00:00.000Z'),
        offerId: 'offer-a',
        sourceKeyword: '文具',
        rank: 2,
        title: '젤펜',
        tradeScore: '88',
      }));
      expect(rows.find((row) => row.offerId === 'offer-a' && row.sourceKeyword === '儿童笔袋')).toEqual(expect.objectContaining({
        offerId: 'offer-a',
        sourceKeyword: '儿童笔袋',
        rank: 1,
        title: 'duplicate',
      }));
      expect(rows.find((row) => row.offerId === 'offer-b')).toEqual(expect.objectContaining({
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
    const rows = typedRows(ports, 'tiktok_creative');
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
    const rows = typedRows(ports, 'naver_keyword');
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
    const rows = typedRows(ports, 'naver_popular_keyword');
    expect(rows).toHaveLength(2);
    // 인기보드 키워드도 검색광고 월검색량 조회 대상에 포함된다(신규 키워드 검색량 조인용).
    const volumeRows = typedRows(ports, 'naver_keyword');
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

  it('refuses the retired direct 1688 provider path', async () => {
    const result = await ports.service.collect(ORGANIZATION_ID, ['1688']);

    expect(result.results[0]).toEqual(expect.objectContaining({
      source: '1688',
      ok: false,
      collected: 0,
      error: expect.stringContaining('1688_browser_operation_required'),
    }));
  });

  it('degrades gracefully when shorts port returns an error, without aborting other sources', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', sources: ['naver', 'shorts'] }),
    ]);
    ports.shortstrend.fetchTrending = vi.fn(async () => ({
      source: 'shortstrend',
      generatedAt: '2026-07-13T00:00:00.000Z',
      items: [],
      error: 'shortstrend unreachable',
    }));

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts']);

    expect(result.results).toEqual([
      expect.objectContaining({ source: 'naver', ok: true, collected: 1 }),
      { source: 'shorts', ok: false, collected: 0, error: 'shortstrend unreachable' },
    ]);
    expect(typedRows(ports, 'shorts')).toEqual([]);
  });

  it('isolates a failing source so the others still collect', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '슬라임', sources: ['naver', 'shorts'] }),
    ]);
    ports.keywordResearch.searchRelatedKeywords = vi.fn(async () => {
      throw new Error('SearchAd 401');
    });
    ports.popularKeywords.searchPopularKeywords = vi.fn(async () => {
      throw new Error('DataLab down');
    });
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

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts']);

    const naver = result.results.find((r) => r.source === 'naver');
    const shorts = result.results.find((r) => r.source === 'shorts');
    expect(naver).toEqual(expect.objectContaining({ source: 'naver', ok: false, collected: 0 }));
    expect(shorts).toEqual({ source: 'shorts', ok: true, collected: 1 });
    expect(typedRows(ports, 'shorts')).toHaveLength(1);
  });
});
