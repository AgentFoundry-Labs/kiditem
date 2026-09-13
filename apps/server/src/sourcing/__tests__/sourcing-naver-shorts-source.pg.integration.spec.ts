import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import { TrendQueryService } from '../application/service/trend-query.service';
import { TrendCollectionController } from '../adapter/in/http/trend-collection.controller';
import { SourcingKeywordAnalysisController } from '../adapter/in/http/sourcing-keyword-analysis.controller';
import { NaverKeywordResearchService } from '../application/service/naver-keyword-research.service';
import { TrendCollectService } from '../application/service/trend-collect.service';

const organizationId = TEST_ORGANIZATION_ID;

describe('Naver/Shorts public collection owner (disposable PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: TrendCollectService;
  let analysis: NaverKeywordResearchService;
  let history: TrendCollectionRepositoryAdapter;
  const searchAutocompleteKeywords = vi.fn();
  const fetchTrending = vi.fn();
  const searchRelatedKeywords = vi.fn();
  const compareSearchTrends = vi.fn();
  const searchPopularKeywords = vi.fn();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    history = new TrendCollectionRepositoryAdapter(prisma as never);
    const attempts = new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
      new SourceFailureAlerts(prisma as never));
    analysis = new NaverKeywordResearchService({ searchRelatedKeywords } as never,
      { compareSearchTrends } as never, { searchPopularKeywords }, { searchAutocompleteKeywords }, history,
      attempts as never);
    service = new TrendCollectService(
      { searchRelatedKeywords } as never, { compareSearchTrends } as never,
      { searchPopularKeywords }, { fetchTrending }, history,
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
        new SourceFailureAlerts(prisma as never)) as never,
    );
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.resetAllMocks();
    fetchTrending.mockResolvedValue({ source: 'shortstrend', generatedAt: new Date().toISOString(),
      items: [{ videoKey: ' video-1 ', rank: 1.4, title: 'Kids', viewCount: 100.6, keyword: '문구' },
        { videoKey: 'video-1', title: 'duplicate' }] });
  });

  it('publishes Shorts once, replays without IO after seed drift, retains prior COMPLETE on failure and replaces confirmed empty coverage', async () => {
    const controller = new TrendCollectionController(service, new TrendQueryService(history));
    const first = await controller.collect({ sources: ['shorts'] }, organizationId, { id: TEST_USER_ID } as never, 'first');
    expect(first.results[0], JSON.stringify(first.results[0])).toMatchObject({ source: 'shorts', ok: true, state: 'COMPLETE', collected: 1 });
    expect(fetchTrending).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, publishedWithinDays: 30,
      keywords: expect.arrayContaining(['문구', '완구']) }));
    expect(await history.findShortsHistory({ organizationId, days: 7 })).toMatchObject([
      { videoKey: 'video-1', rank: 1, viewCount: 101, title: 'Kids' },
    ]);
    await history.upsertSeedByKeyword({ organizationId, keyword: '새 시드', sources: ['shorts'] });
    const replay = await service.collect(organizationId, ['shorts'], TEST_USER_ID, 'first');
    expect(replay).toEqual(first);
    expect(fetchTrending).toHaveBeenCalledTimes(1);
    await history.deleteSeed({ organizationId, id: (await history.listSeeds(organizationId))[0].id });
    fetchTrending.mockResolvedValueOnce({ source: 'shortstrend', items: [], error: 'provider unavailable' });
    expect((await service.collect(organizationId, ['shorts'], TEST_USER_ID, 'failed')).results[0])
      .toMatchObject({ state: 'FAILED', ok: false, error: 'provider unavailable' });
    expect(await history.findShortsHistory({ organizationId, days: 7 })).toHaveLength(1);
    expect(await prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .toMatchObject([{ status: 'OPEN' }]);
    fetchTrending.mockResolvedValueOnce({ source: 'shortstrend', items: [] });
    expect((await service.collect(organizationId, ['shorts'], TEST_USER_ID, 'empty')).results[0])
      .toMatchObject({ state: 'COMPLETE', collected: 0 });
    expect(await history.findShortsHistory({ organizationId, days: 7 })).toEqual([]);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    expect(await prisma.masterProductAbcEvaluation.count()).toBe(0);
    expect(await prisma.alert.findMany({ where: { organizationId, type: 'source_failure' } }))
      .toMatchObject([{ status: 'RESOLVED' }]);
  });
  it('attempts later Naver stages and Shorts after popular failure, without exposing partial daily data', async () => {
    await history.upsertSeedByKeyword({ organizationId, keyword: '슬라임', sources: ['naver'] });
    searchPopularKeywords.mockRejectedValue(new Error('popular blocked'));
    searchRelatedKeywords.mockResolvedValue({ items: [] });
    compareSearchTrends.mockResolvedValue({ items: [] });
    const result = await service.collect(organizationId, ['shorts', 'naver'], TEST_USER_ID, 'partial');
    expect(result.results.map((row) => [row.source, row.state])).toEqual([['naver', 'FAILED'], ['shorts', 'COMPLETE']]);
    expect(searchPopularKeywords).toHaveBeenCalledWith({ boardKeys: ['birth_kids', 'toys_dolls', 'stationery_office'], signal: undefined });
    expect(searchRelatedKeywords).toHaveBeenCalledWith({ seedKeywords: ['슬라임'], maxResults: 100, signal: undefined });
    expect(compareSearchTrends).toHaveBeenCalledWith({ keywords: ['슬라임'], signal: undefined });
    expect(await history.findNaverKeywordHistory({ organizationId, days: 7 })).toEqual([]);
    expect(await prisma.naverKeywordDailySnapshot.count()).toBe(0);
  });

  it('publishes exact analysis input as immutable COMPLETE evidence and replays the original result without providers', async () => {
    const generatedAt = new Date().toISOString();
    searchRelatedKeywords.mockResolvedValue({ source: 'naver-searchad-keywordstool',
      seedKeywords: ['슬라임'], generatedAt, items: [] });
    searchAutocompleteKeywords.mockResolvedValue({ source: 'naver-search-autocomplete',
      keyword: '슬라임', generatedAt, items: [] });
    const input = { action: 'related', keyword: '  슬라임  ', gender: 'f', age: '30', device: 'mo' };
    const controller = new SourcingKeywordAnalysisController(analysis);
    const publicResult = await controller.collect(input, organizationId, { id: TEST_USER_ID } as never, 'analysis');
    expect(publicResult.attempt).not.toHaveProperty('attemptToken');
    const first = await analysis.collectAnalysis({ organizationId, input, idempotencyKey: 'analysis', requestedByUserId: TEST_USER_ID });
    expect(first.attempt.errorMessage).toBeNull();
    expect(first).toMatchObject({ attempt: { state: 'COMPLETE' }, payload: { input: { keyword: '슬라임' } } });
    expect(await analysis.getAnalysisSnapshot(organizationId, input)).toEqual(first.payload);
    expect(await analysis.getAnalysisSnapshot(organizationId, { ...input, keyword: '연필' })).toBeNull();
    expect(await analysis.collectAnalysis({ organizationId, input, idempotencyKey: 'analysis', requestedByUserId: TEST_USER_ID })).toEqual(first);
    expect(searchRelatedKeywords).toHaveBeenCalledTimes(1);
    expect(searchAutocompleteKeywords).toHaveBeenCalledWith({ keyword: '슬라임', maxResults: 30, signal: undefined });
    await expect(analysis.collectAnalysis({ organizationId, input: { ...input, device: 'pc' }, idempotencyKey: 'analysis' })).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');
    searchRelatedKeywords.mockRejectedValueOnce(new Error('SearchAd unavailable'));
    expect(await analysis.collectAnalysis({ organizationId, input, idempotencyKey: 'analysis-failed' }))
      .toMatchObject({ attempt: { state: 'FAILED' }, payload: null });
    expect(await analysis.getAnalysisSnapshot(organizationId, input)).toEqual(first.payload);
    await prisma.sourcingEvidenceObservation.updateMany({
      where: { organizationId, ingestionRunId: first.attempt.attemptId },
      data: { payload: { legacy: 'raw evidence must not drive the screen' } },
    });
    expect(await analysis.getAnalysisSnapshot(organizationId, input)).toEqual(first.payload);
    await prisma.sourcingNaverKeywordAnalysisFact.deleteMany({
      where: { organizationId, ingestionRunId: first.attempt.attemptId },
    });
    expect(await analysis.getAnalysisSnapshot(organizationId, input)).toBeNull();
    expect(await prisma.sourcingWorkspaceSnapshot.count({ where: { scope: 'keyword_analysis' } })).toBe(0);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
  });

  it('persists and replays all 50 valid compare inputs without truncation and rejects 51 before IO', async () => {
    const keywords = Array.from({ length: 50 }, (_, index) => '비교' + index);
    compareSearchTrends.mockImplementation(async (input) => ({ source: 'naver-datalab-search-trend', keywords: input.keywords,
      startDate: '2026-08-06', endDate: '2026-09-06', timeUnit: 'date', generatedAt: new Date().toISOString(), items: input.keywords.map((keyword: string) => ({ keyword,
        latestRatio: 1, previousAverageRatio: 0, peakRatio: 1, trendDelta: 1, trendRate: null, data: [] })) }));
    const input = { action: 'compare', keywords };
    const first = await analysis.collectAnalysis({ organizationId, input, idempotencyKey: 'compare50' });
    expect(first.attempt.errorMessage).toBeNull();
    expect(first.attempt.state).toBe('COMPLETE');
    expect(compareSearchTrends.mock.calls[0][0].keywords).toEqual(keywords);
    expect(await analysis.getAnalysisSnapshot(organizationId, input)).toEqual(first.payload);
    expect(await analysis.collectAnalysis({ organizationId, input, idempotencyKey: 'compare50' })).toEqual(first);
    expect(compareSearchTrends).toHaveBeenCalledTimes(1);
    await expect(analysis.collectAnalysis({ organizationId, input: { ...input, keywords: [...keywords, '51'] },
      idempotencyKey: 'compare51' })).rejects.toThrow();
    expect(compareSearchTrends).toHaveBeenCalledTimes(1);
  });

  it('publishes Naver metrics, keeps full prior on DataLab failure and uses empty board coverage without deleting other keyword history', async () => {
    const seed = await history.upsertSeedByKeyword({ organizationId, keyword: '슬라임', sources: ['naver'] });
    searchPopularKeywords.mockResolvedValue({ boards: [{ key: 'toys_dolls', label: '완구', cid: 1,
      ranks: [{ rank: 1, keyword: ' 레고 ', linkId: null }], error: null }] });
    searchRelatedKeywords.mockImplementation(async (input) => ({ items: input.seedKeywords.map((keyword: string) => ({ keyword,
      monthlyPcSearchCount: 2.1, monthlyMobileSearchCount: 8.6, monthlyTotalSearchCount: 10.7, averageAdRank: 1.6 })) }));
    compareSearchTrends.mockResolvedValue({ items: [{ keyword: '슬 라 임', latestRatio: 120.2, trendDelta: -3.6 }] });
    expect((await service.collect(organizationId, ['naver'], TEST_USER_ID, 'naver-first')).results[0])
      .toMatchObject({ state: 'COMPLETE', collected: 3 });
    expect(await history.findNaverKeywordHistory({ organizationId, days: 7 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ keyword: '슬라임', monthlyTotalSearchCount: 11, averageAdRank: 2, trendRatio: 100, trendDelta: -4 }),
    ]));
    compareSearchTrends.mockRejectedValueOnce(new Error('DataLab failed'));
    expect((await service.collect(organizationId, ['naver'], TEST_USER_ID, 'naver-partial')).results[0].state).toBe('FAILED');
    expect((await new TrendQueryService(history).getPopularKeywords(organizationId, 7)).boards)
      .toEqual(expect.arrayContaining([expect.objectContaining({ boardKey: 'toys_dolls', latest: [{ rank: 1, keyword: '레고' }] })]));
    // A different frozen keyword set must not erase unrelated prior keyword observations.
    await history.deleteSeed({ organizationId, id: seed.id });
    searchPopularKeywords.mockResolvedValue({ boards: [] });
    expect((await service.collect(organizationId, ['naver'], TEST_USER_ID, 'naver-empty')).results[0].state).toBe('COMPLETE');
    const popular = await history.findPopularKeywordHistory({ organizationId, days: 7 });
    expect(popular.rows).toEqual([]);
    expect(popular.coverage).toHaveLength(3);
    expect((await new TrendQueryService(history).getPopularKeywords(organizationId, 7)).boards)
      .toEqual(expect.arrayContaining([expect.objectContaining({ boardKey: 'toys_dolls', latest: [] })]));
    expect(await history.findNaverKeywordHistory({ organizationId, days: 7 })).toHaveLength(2);
  });

  it.each(['naver', 'shorts'] as const)('keeps %s visible COMPLETE cutoff and last failure across day rollover', async (source) => {
    searchPopularKeywords.mockResolvedValue({ boards: [] });
    searchRelatedKeywords.mockResolvedValue({ items: [] });
    compareSearchTrends.mockResolvedValue({ items: [] });
    const controller = new TrendCollectionController(service, new TrendQueryService(history));
    const completed = (await controller.collect({ sources: [source] }, organizationId,
      { id: TEST_USER_ID } as never, 'yesterday-complete')).results[0];
    const failProvider = () => source === 'shorts'
      ? fetchTrending.mockRejectedValueOnce(new Error('provider failed'))
      : searchPopularKeywords.mockRejectedValueOnce(new Error('provider failed'));
    failProvider();
    const yesterdayFailure = (await controller.collect({ sources: [source] }, organizationId,
      { id: TEST_USER_ID } as never, 'yesterday-failed')).results[0];
    const tomorrow = Date.now() + 24 * 60 * 60_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(tomorrow);
    try {
      const noAttemptToday = (await controller.status(organizationId))[source];
      expect(noAttemptToday).toMatchObject({ ready: false, actualCutoffAt: new Date(completed.actualCutoffAt!),
        latestComplete: { attemptId: completed.attemptId }, latestAttempt: { attemptId: yesterdayFailure.attemptId, state: 'FAILED' },
        errorMessage: yesterdayFailure.error });
      failProvider();
      const todayFailure = (await controller.collect({ sources: [source] }, organizationId,
        { id: TEST_USER_ID } as never, 'today-failed')).results[0];
      const failedToday = (await controller.status(organizationId))[source];
      expect(failedToday).toMatchObject({ ready: false, actualCutoffAt: new Date(completed.actualCutoffAt!),
        latestComplete: { attemptId: completed.attemptId }, latestAttempt: { attemptId: todayFailure.attemptId, state: 'FAILED' },
        errorMessage: todayFailure.error });
    } finally { vi.useRealTimers(); }
  });

  it('replays a RUNNING request without IO and rejects a distinct active start while preserving source-owned status', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fetchTrending.mockImplementationOnce(async () => { await gate; return { source: 'shortstrend', items: [] }; });
    const pending = service.collect(organizationId, ['shorts'], TEST_USER_ID, 'held');
    await vi.waitFor(() => expect(fetchTrending).toHaveBeenCalledOnce());
    try {
      const replay = await service.collect(organizationId, ['shorts'], TEST_USER_ID, 'held');
      expect(replay.results[0].state).toBe('RUNNING');
      await expect(service.collectSource(organizationId, 'shorts', TEST_USER_ID, 'distinct')).rejects.toThrow('Conflict');
      expect(fetchTrending).toHaveBeenCalledOnce();
      expect(await service.status(organizationId, 'shorts')).toMatchObject({ ready: false, latestComplete: null, latestAttempt: { state: 'RUNNING' } });
    } finally { release(); }
    expect((await pending).results[0].state).toBe('COMPLETE');
  });

});
