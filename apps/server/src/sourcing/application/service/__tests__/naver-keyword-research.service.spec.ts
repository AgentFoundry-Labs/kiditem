import { describe, it, expect, vi } from 'vitest';
import { NaverKeywordResearchService } from '../naver-keyword-research.service';
import type {
  NaverAutocompleteKeywordPort,
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordPort,
  NaverDatalabTrendPort,
  NaverKeywordResearchPort,
} from '../../port/out/provider/naver-keyword-research.port';
import type {
  NaverPopularKeywordSnapshotRow,
  TrendCollectionRepositoryPort,
} from '../../port/out/repository/trend-collection.repository.port';
import type { SourcingTypedCollectionRecord } from '../../port/out/repository/sourcing-collection.repository.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';

function board(ranks: Array<{ rank: number; keyword: string }>): NaverDatalabPopularKeywordBoard {
  return {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    date: '',
    datetime: '',
    range: '2026.07.07. ~ 2026.07.13.',
    ranks: ranks.map((r) => ({ ...r, linkId: null, categories: [] })),
    error: null,
  };
}

function priorRow(rank: number, keyword: string): NaverPopularKeywordSnapshotRow {
  return {
    boardKey: 'toys_dolls',
    boardLabel: '완구/인형',
    cid: '50000142',
    businessDate: new Date('2020-01-01T00:00:00.000Z'), // 항상 오늘 이전
    rank,
    keyword,
    linkId: null,
  };
}

function makeService(history: NaverPopularKeywordSnapshotRow[], boards: NaverDatalabPopularKeywordBoard[]) {
  const keywordResearch = {
    getStatus: vi.fn(() => ({ configured: true, requiredEnv: [] })),
    searchRelatedKeywords: vi.fn(async (input: { seedKeywords: string[] }) => ({
      source: 'naver-searchad-keywordstool' as const,
      seedKeywords: input.seedKeywords,
      generatedAt: '2026-08-14T00:00:00.000Z',
      items: [],
    })),
  } as unknown as NaverKeywordResearchPort;
  const trends = {
    getStatus: vi.fn(() => ({ configured: true, requiredEnv: [] })),
    compareSearchTrends: vi.fn(async (input: { keywords: string[] }) => ({
      source: 'naver-datalab-search-trend' as const,
      keywords: input.keywords,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      timeUnit: 'date' as const,
      generatedAt: '2026-08-14T00:00:00.000Z',
      items: [],
    })),
  } as unknown as NaverDatalabTrendPort;
  const autocomplete = {
    searchAutocompleteKeywords: vi.fn(async (input: { keyword: string }) => ({
      source: 'naver-search-autocomplete' as const,
      keyword: input.keyword,
      generatedAt: '2026-08-14T00:00:00.000Z',
      items: [],
    })),
  } as unknown as NaverAutocompleteKeywordPort;
  const popular = {
    searchPopularKeywords: vi.fn(async () => ({
      source: 'naver-datalab-shopping-keyword-rank' as const,
      timeUnit: 'date' as const,
      startDate: '2026-07-07',
      endDate: '2026-07-13',
      device: null,
      gender: null,
      ages: [],
      generatedAt: new Date().toISOString(),
      boards,
    })),
  } as unknown as NaverDatalabPopularKeywordPort;
  const trendRepo = {
    findPopularKeywordHistory: vi.fn(async () => history),
  } as unknown as TrendCollectionRepositoryPort;
  let committedRecords: SourcingTypedCollectionRecord[] = [];
  const collectionCoordinator = {
    execute: vi.fn(async (input: any, collector: any) => {
      const output = await collector({
        permit: {
          runId: '00000000-0000-4000-8000-000000000001',
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          leaseToken: '00000000-0000-4000-8000-000000000002',
          generation: 1,
          leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
        },
        checkpoint: async () => undefined,
      });
      committedRecords = output.typedRecords;
      return { kind: 'committed', runId: input.idempotencyKey, acceptedCount: output.discoveredCount, duplicateCount: 0, staleDiscardedCount: 0 };
    }),
  } as unknown as SourcingCollectionCoordinator;
  const snapshots = {
    upsertInAttempt: vi.fn(async (_transaction: unknown, input: unknown) => input),
  };
  const ServiceWithSnapshots = NaverKeywordResearchService as unknown as new (
    ...args: unknown[]
  ) => NaverKeywordResearchService;
  const service = new ServiceWithSnapshots(
    keywordResearch,
    trends,
    popular,
    autocomplete,
    trendRepo,
    collectionCoordinator,
    snapshots,
  );
  return {
    service,
    keywordResearch,
    trends,
    autocomplete,
    snapshots,
    trendRepo,
    committedRecords: () => committedRecords,
  };
}

describe('NaverKeywordResearchService.searchPopularKeywords NEW/급상승', () => {
  it('직전 저장일과 비교해 신규/상승/하락을 채운다', async () => {
    const { service, committedRecords } = makeService(
      [priorRow(1, '토미카'), priorRow(2, '레고')],
      [board([
        { rank: 1, keyword: '레고' }, // 이전 2위 → 상승(+1)
        { rank: 2, keyword: '신상완구' }, // 이전에 없음 → 신규
        { rank: 3, keyword: '토미카' }, // 이전 1위 → 하락(-2)
      ])],
    );

    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    const ranks = result.boards[0].ranks;

    expect(ranks[0]).toMatchObject({ keyword: '레고', isNew: false, previousRank: 2, rankDelta: 1 });
    expect(ranks[1]).toMatchObject({ keyword: '신상완구', isNew: true, previousRank: null, rankDelta: null });
    expect(ranks[2]).toMatchObject({ keyword: '토미카', isNew: false, previousRank: 1, rankDelta: -2 });

    // 오늘 순위는 coordinator의 단일 typed-record commit으로 전달한다.
    const savedRows = committedRecords()
      .filter((record) => record.kind === 'naver_popular_keyword')
      .map((record) => record.row);
    expect(savedRows).toHaveLength(3);
    expect(savedRows[0]).toMatchObject({ organizationId: 'org-1', boardKey: 'toys_dolls', keyword: '레고', rank: 1 });
  });

  it('직전 데이터가 없으면 신규로 오인하지 않는다(전부 isNew=false)', async () => {
    const { service } = makeService([], [board([{ rank: 1, keyword: '레고' }])]);
    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    expect(result.boards[0].ranks[0]).toMatchObject({ isNew: false, previousRank: null, rankDelta: null });
  });

  it('저장소가 실패해도 순위 조회는 그대로 반환한다', async () => {
    const { service, trendRepo } = makeService([], [board([{ rank: 1, keyword: '레고' }])]);
    (trendRepo.findPopularKeywordHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    expect(result.boards[0].ranks[0].keyword).toBe('레고');
  });

  it('publishes the trend-agent snapshot only inside the active operation attempt after signal-aware provider work', async () => {
    const { service, keywordResearch, trends, autocomplete, snapshots } = makeService(
      [],
      [board([{ rank: 1, keyword: '레고' }])],
    );
    const controller = new AbortController();
    const transaction = { opaque: true };
    const withinActiveOperationAttemptFence = vi.fn(async (commit: (tx: unknown) => Promise<unknown>) =>
      commit(transaction));
    const keywordAnalysis = service as unknown as {
      collectAnalysis(input: {
        organizationId: string;
        input: Record<string, unknown>;
        signal: AbortSignal;
        checkpoint: () => Promise<void>;
        withinActiveOperationAttemptFence: (commit: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
      }): Promise<{ snapshot: unknown }>;
    };

    await expect(keywordAnalysis.collectAnalysis({
      organizationId: 'org-1',
      input: {
        action: 'trend_agent',
        timeUnit: 'date',
        gender: 'all',
        age: '20',
        device: 'all',
        selectedBoardKey: 'all',
        rankLimit: 20,
        focusMode: 'all',
        finalLimit: 30,
      },
      signal: controller.signal,
      checkpoint: vi.fn(async () => undefined),
      withinActiveOperationAttemptFence,
    })).resolves.toEqual(expect.objectContaining({ snapshot: expect.anything() }));

    expect(keywordResearch.searchRelatedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(trends.compareSearchTrends).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal, ages: ['3', '4'] }),
    );
    expect(autocomplete.searchAutocompleteKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(withinActiveOperationAttemptFence).toHaveBeenCalledTimes(1);
    expect(snapshots.upsertInAttempt).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ organizationId: 'org-1', scope: 'keyword_analysis' }),
    );
  });

  it('does not publish the trend-agent snapshot when the final active attempt fence is lost', async () => {
    const { service, snapshots } = makeService([], [board([{ rank: 1, keyword: '레고' }])]);
    const keywordAnalysis = service as unknown as {
      collectAnalysis(input: {
        organizationId: string;
        input: Record<string, unknown>;
        signal: AbortSignal;
        checkpoint: () => Promise<void>;
        withinActiveOperationAttemptFence: (commit: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
      }): Promise<unknown>;
    };

    await expect(keywordAnalysis.collectAnalysis({
      organizationId: 'org-1',
      input: {
        action: 'trend_agent',
        timeUnit: 'date',
        gender: 'all',
        age: 'all',
        device: 'all',
        selectedBoardKey: 'all',
        rankLimit: 20,
        focusMode: 'all',
        finalLimit: 30,
      },
      signal: new AbortController().signal,
      checkpoint: vi.fn(async () => undefined),
      withinActiveOperationAttemptFence: vi.fn(async () => {
        throw new Error('operation_attempt_fence_lost');
      }),
    })).rejects.toThrow('operation_attempt_fence_lost');

    expect(snapshots.upsertInAttempt).not.toHaveBeenCalled();
  });
});
