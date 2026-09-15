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
import type { SourcingBrowserSourceAttempt } from '../../port/out/repository/sourcing-browser-source-attempt.repository.port';

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
    findPopularKeywordHistory: vi.fn(async () => ({ rows: [], coverage: [] })),
    findKeywordAnalysisSnapshot: vi.fn(async () => null),
    findLatestCompleteTrendScope: vi.fn(async () => null),
    find1688HotHistory: vi.fn(async () => []),
    findShortsHistory: vi.fn(async () => []),
    findShortsHistoryWithCoverage: vi.fn(async () => ({ rows: [], coverage: [] })),
    findTiktokCcHistory: vi.fn(async () => []),
  };
  const collectionOutputs: Array<{ typedRecords: Array<{ kind: string; row: unknown }> }> = [];
  let attempt: SourcingBrowserSourceAttempt;
  const attempts = {
    beginAttempt: vi.fn(async (input) => {
      attempt = { ...input, attemptId: '00000000-0000-4000-8000-000000000010',
        attemptToken: '00000000-0000-4000-8000-000000000011', generation: 1, state: 'RUNNING',
        acceptedCount: 0, expiresAt: new Date(Date.now() + 60_000), completedAt: null,
        contentChecksum: null, errorCode: null, errorMessage: null };
      return { attempt, created: true };
    }),
    completeAttempt: vi.fn(async (input) => {
      collectionOutputs.push(input.output);
      return { ...attempt, state: 'COMPLETE' as const, acceptedCount: input.output.discoveredCount };
    }),
    failAttempt: vi.fn(async (input) => ({ ...attempt, state: 'FAILED' as const, errorMessage: input.message })),
  };

  const service = new TrendCollectService(
    keywordResearch,
    datalabTrend,
    popularKeywords,
    shortstrend,
    repository,
    attempts as never,
  );

  return {
    service,
    attempts,
    keywordResearch,
    datalabTrend,
    popularKeywords,
    shortstrend,
    repository,
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

describe('source start isolation', () => {
  it('continues aggregate sources after rejected start without inventing an attempt, but single-source propagates', async () => {
    const ports = buildPorts();
    ports.attempts.beginAttempt.mockRejectedValueOnce(new Error('SOURCE_DISABLED'));
    const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts'], null, 'aggregate');
    expect(result.results[0]).toMatchObject({ source: 'naver', ok: false, error: 'SOURCE_DISABLED' });
    expect(result.results[0]).not.toHaveProperty('attemptId');
    expect(result.results[1]).toMatchObject({ source: 'shorts', ok: true });
    expect(ports.shortstrend.fetchTrending).toHaveBeenCalledOnce();
    expect(ports.attempts.failAttempt).not.toHaveBeenCalled();
    ports.attempts.beginAttempt.mockRejectedValueOnce(new Error('ACTIVE_ATTEMPT_CONFLICT'));
    await expect(ports.service.collectSource(ORGANIZATION_ID, 'naver', null, 'distinct'))
      .rejects.toThrow('ACTIVE_ATTEMPT_CONFLICT');
  });
});

describe('TrendCollectService', () => {
  let ports: ReturnType<typeof buildPorts>;

  beforeEach(() => {
    ports = buildPorts();
  });

  it('stops before loading seeds when the collection signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('collection_cancelled'));

    await expect(ports.service.collect(
      ORGANIZATION_ID,
      ['naver'],
      null,
      'request-1',
      controller.signal,
    )).rejects.toThrow('collection_cancelled');
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
      controller.abort(new Error('collection_cancelled'));
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
      'request-1',
      controller.signal,
    )).rejects.toThrow('collection_cancelled');

    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledTimes(1);
    expect(ports.keywordResearch.searchRelatedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('maps Naver chunks with concurrency exactly two while preserving keyword order', async () => {
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

    const collection = ports.service.collectSource(
      ORGANIZATION_ID,
      'naver',
      null,
      'request-1',
      { signal: new AbortController().signal },
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
        controller.abort(new Error('collection_cancelled'));
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
      'request-1',
      { signal: controller.signal },
    );
    const rejected = expect(collection).rejects.toThrow('collection_cancelled');
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
      controller.abort(new Error('collection_cancelled'));
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
      'request-1',
      controller.signal,
    )).rejects.toThrow('collection_cancelled');
  });

  it('passes the signal to the Shorts batch and stops after provider abort', async () => {
    const controller = new AbortController();
    ports.shortstrend.fetchTrending = vi.fn(async () => {
      controller.abort(new Error('collection_cancelled'));
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
      'request-1',
      controller.signal,
    )).rejects.toThrow('collection_cancelled');

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

  it('returns the pre-cutover TikTok source seed set without changing its 20-target server cap', async () => {
    ports.repository.listSeeds = vi.fn(async () => [
      seed({ keyword: '  school supplies  ', sources: ['tiktok-cc'] }),
      seed({ keyword: 'disabled', sources: ['tiktok-cc'], enabled: false }),
      seed({ keyword: 'other source', sources: ['shorts'] }),
      ...Array.from({ length: 20 }, (_, index) => seed({
        keyword: `tiktok-${index}`,
        sources: ['tiktok-cc'],
      })),
    ]);

    const targets = await ports.service.listTiktokCcTargets(ORGANIZATION_ID);

    expect(targets).toHaveLength(20);
    expect(targets[0]).toEqual({ label: '  school supplies  ', keyword: '  school supplies  ' });
    expect(targets).not.toContainEqual(expect.objectContaining({ label: 'disabled' }));
    expect(targets).not.toContainEqual(expect.objectContaining({ label: 'other source' }));
  });

  it('leaves 1688 extension publication exclusively to its token-fenced source owner', () => {
    expect(ports.service).not.toHaveProperty('ingest1688ExtensionResults');
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

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver'], null, 'manual');

    expect(result.results).toMatchObject([{ source: 'naver', ok: true, collected: 2 }]);
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

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver'], null, 'manual');

    // 인기보드 2행 저장 + 그 키워드(레고·블록)의 검색광고 볼륨 스냅샷 2행 = 4.
    expect(result.results).toMatchObject([{ source: 'naver', ok: true, collected: 4 }]);
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

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts'], null, 'manual');

    expect(result.results).toMatchObject([
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

    const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts'], null, 'manual');

    const naver = result.results.find((r) => r.source === 'naver');
    const shorts = result.results.find((r) => r.source === 'shorts');
    expect(naver).toEqual(expect.objectContaining({ source: 'naver', ok: false, collected: 0 }));
    expect(shorts).toMatchObject({ source: 'shorts', ok: true, collected: 1 });
    expect(typedRows(ports, 'shorts')).toHaveLength(1);
  });

  // Before 09:00 KST, UTC midnight of the KST business date is later than the
  // capture, so a window starting there is reversed and declares no day.
  it.each([
    ['03:30 KST', '2026-09-06T18:30:00.000Z'],
    ['12:00 KST', '2026-09-07T03:00:00.000Z'],
  ])('declares the KST day containing a capture at %s as the source window', async (_label, capturedAt) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(capturedAt));
    try {
      ports.shortstrend.fetchTrending = vi.fn(async () => ({
        source: 'shortstrend' as const,
        generatedAt: capturedAt,
        items: [{ videoKey: 'vid-1', title: null, channelName: null, viewCount: null, likeCount: null,
          commentCount: null, keyword: '문구', publishedAt: null, thumbnailUrl: null, videoUrl: null, rank: 1 }],
      }));

      const result = await ports.service.collect(ORGANIZATION_ID, ['naver', 'shorts'], null, 'window');

      expect(result).toMatchObject({ businessDate: '2026-09-07',
        results: [{ source: 'naver', ok: true }, { source: 'shorts', ok: true }] });
      const sourceWindow = {
        sourceWindowStartAt: new Date('2026-09-06T15:00:00.000Z'),
        sourceWindowEndAt: new Date(capturedAt),
      };
      expect(ports.attempts.completeAttempt.mock.calls.map(([input]) => ({
        sourceWindowStartAt: input.sourceWindowStartAt,
        sourceWindowEndAt: input.sourceWindowEndAt,
      }))).toEqual([sourceWindow, sourceWindow]);
      expect(typedRows(ports, 'shorts')).toMatchObject([
        { videoKey: 'vid-1', businessDate: new Date('2026-09-07T00:00:00.000Z') },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
