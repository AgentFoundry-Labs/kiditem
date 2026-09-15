import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type MarketShadowSnapshotPayload,
  SourcingShadowSignalService,
} from '../sourcing-shadow-signal.service';
import type {
  SourcingBrowserSourceAttemptRepositoryPort,
  SourcingBrowserSourceAttempt,
} from '../../port/out/repository/sourcing-browser-source-attempt.repository.port';
import type {
  LinkfoxEchotikShadowPort,
  MarketShadowSignalPort,
} from '../../port/out/provider/market-shadow-signal.port';
import type {
  MarketShadowSnapshotRepositoryPort,
  MarketShadowSnapshotRow,
} from '../../port/out/repository/market-shadow-snapshot.repository.port';
import type { TrendCollectionRepositoryPort } from '../../port/out/repository/trend-collection.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-07-15T16:30:00.000Z');
const BUSINESS_DATE = new Date('2026-07-16T00:00:00.000Z');

describe('SourcingShadowSignalService', () => {
  let provider: MarketShadowSignalPort;
  let snapshots: MarketShadowSnapshotRepositoryPort;
  let trends: TrendCollectionRepositoryPort;
  let linkfox: LinkfoxEchotikShadowPort;
  let attempts: SourcingBrowserSourceAttemptRepositoryPort;
  const input = { organizationId: ORGANIZATION_ID, idempotencyKey: 'shadow-key' };
  let service: SourcingShadowSignalService;

  beforeEach(() => {
    provider = {
      fetchTrending: vi.fn(async () => ({
        source: 'google-trends-rss',
        generatedAt: NOW.toISOString(),
        items: [
          {
            externalId: 'gtr_1',
            source: 'google-trends-rss',
            title: '새 학기 필통 인기',
            rawTitle: '새 학기 필통 인기',
            approximateTraffic: 10_000,
            approximateTrafficLabel: '10K+',
            publishedAt: NOW.toISOString(),
            sourceUrl: 'https://news.example/trend/1',
            newsItems: [],
            relevanceLabel: '필기구·학용품',
            raw: {},
          },
        ],
      })),
    };
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '0');
    let snapshot: MarketShadowSnapshotRow | null = null;
    let attempt: SourcingBrowserSourceAttempt;
    snapshots = {
      findAttemptIdByKey: vi.fn(async () => null),
      findByAttempt: vi.fn(async () => snapshot),
      readLatest: vi.fn(async () => ({
        latestAttempt: null,
        latestComplete: null,
        actualCutoffAt: null,
      })),
      listRecent: vi.fn(async () => []),
    };
    attempts = {
      beginAttempt: vi.fn(
        async (
          admission: Parameters<SourcingBrowserSourceAttemptRepositoryPort['beginAttempt']>[0],
        ) => {
          attempt = {
            ...admission,
            attemptId: 'attempt-1',
            attemptToken: 'secret',
            state: 'RUNNING',
            expiresAt: new Date(NOW.getTime() + 900_000),
            errorCode: null,
            errorMessage: null,
          } as SourcingBrowserSourceAttempt;
          return { created: true, attempt };
        },
      ),
      readAttempt: vi.fn(async () => attempt),
      completeAttempt: vi.fn(
        async (
          terminal: Parameters<SourcingBrowserSourceAttemptRepositoryPort['completeAttempt']>[0],
        ) => {
          snapshot = row(terminal.output.observations[0].rawPayload);
          attempt = { ...attempt, state: 'COMPLETE' };
          return attempt;
        },
      ),
      failAttempt: vi.fn(
        async (
          terminal: Parameters<SourcingBrowserSourceAttemptRepositoryPort['failAttempt']>[0],
        ) => {
          attempt = {
            ...attempt,
            state: 'FAILED',
            errorCode: terminal.code,
            errorMessage: terminal.message,
          };
          return attempt;
        },
      ),
    } as unknown as SourcingBrowserSourceAttemptRepositoryPort;
    trends = trendRepository();
    linkfox = linkfoxProvider();
    service = new SourcingShadowSignalService(provider, snapshots, trends, attempts, linkfox);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits the KST day before provider IO and retains disabled Google/baseline evaluation', async () => {
    const result = await service.collect(input, NOW);
    expect(attempts.beginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: 'market_shadow_signals',
        scopeKey: 'day',
        targetKey: '2026-07-16',
        expiresInMs: 900_000,
        plan: expect.objectContaining({ experiment: 'paired-shadow-v1', windowDays: 30 }),
      }),
    );
    expect(vi.mocked(attempts.beginAttempt).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(provider.fetchTrending).mock.invocationCallOrder[0],
    );
    expect(provider.fetchTrending).toHaveBeenCalledWith(
      expect.objectContaining({
        seedKeywords: expect.arrayContaining(['필통', '儿童笔袋', '산리오']),
        limit: 100,
      }),
    );
    const payload = result.snapshot!.payload as MarketShadowSnapshotPayload;
    expect(payload.input.sources).toEqual(['google-trends-rss']);
    expect(payload.result).toMatchObject({
      status: 'complete',
      decisionImpact: 'disabled',
      evaluation: {
        baseline: { evidenceGroupCount: 4 },
        googleTrends: {
          signalCount: 1,
          relevantSignalCount: 1,
          relevanceLabels: ['필기구·학용품'],
          overlapLabels: ['필기구·학용품'],
          novelLabels: [],
        },
        promotionGate: { minimumObservationDays: 30, observedDays: 1, eligible: false },
      },
    });
    expect(payload.meta).toMatchObject({
      generatedAt: NOW.toISOString(),
      generationSource: 'scheduled',
    });
    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
  });

  // NOW is 01:30 KST: the KST business date's UTC midnight is 09:00 KST, which
  // is later than the capture, so a window starting there would be reversed.
  it('starts the source window at the KST day start when collecting before dawn', async () => {
    await service.collect(input, NOW);

    expect(attempts.completeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceWindowStartAt: new Date('2026-07-15T15:00:00.000Z'),
        sourceWindowEndAt: NOW,
      }),
    );
  });

  it('replays the exact receipt before seeds, configuration and external IO on another day', async () => {
    const first = await service.collect(input, NOW);
    vi.mocked(snapshots.findAttemptIdByKey).mockResolvedValue(first.attemptId);
    vi.mocked(trends.listSeeds).mockClear();
    vi.mocked(provider.fetchTrending).mockClear();
    vi.mocked(trends.findNaverKeywordHistory).mockClear();
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    expect(await service.collect(input, new Date('2026-08-20T00:00:00Z'))).toEqual(first);
    expect(trends.listSeeds).not.toHaveBeenCalled();
    expect(provider.fetchTrending).not.toHaveBeenCalled();
    expect(trends.findNaverKeywordHistory).not.toHaveBeenCalled();
    expect(attempts.beginAttempt).toHaveBeenCalledOnce();
  });

  it('does not admit when cancelled during seed loading', async () => {
    const controller = new AbortController();
    vi.mocked(trends.listSeeds).mockImplementation(async () => {
      controller.abort(new Error('cancelled'));
      return [];
    });
    await expect(service.collect(input, NOW, { signal: controller.signal })).rejects.toThrow(
      'cancelled',
    );
    expect(attempts.beginAttempt).not.toHaveBeenCalled();
    expect(provider.fetchTrending).not.toHaveBeenCalled();
  });

  it('records cancellation after provider completion without publishing a snapshot', async () => {
    const controller = new AbortController();
    vi.mocked(provider.fetchTrending).mockImplementation(async () => {
      controller.abort(new Error('cancelled'));
      return { source: 'google-trends-rss', generatedAt: NOW.toISOString(), items: [] };
    });
    expect(await service.collect(input, NOW, { signal: controller.signal })).toMatchObject({
      state: 'FAILED',
      errorCode: 'SHADOW_COLLECTION_CANCELLED',
      snapshot: null,
    });
    expect(attempts.completeAttempt).not.toHaveBeenCalled();
  });

  it('stores a sanitized bounded Google error without a partial snapshot', async () => {
    vi.mocked(provider.fetchTrending).mockRejectedValue(
      new Error('Authorization: super-secret-token upstream failed'),
    );
    expect(await service.collect(input, NOW)).toMatchObject({
      state: 'FAILED',
      snapshot: null,
      errorMessage: 'google-trends-rss: Authorization=[REDACTED] upstream failed',
    });
    expect(attempts.completeAttempt).not.toHaveBeenCalled();
  });

  it('clamps recent reads to a 30-day KST business-date window', async () => {
    await service.listRecent(ORGANIZATION_ID, 999, NOW);

    expect(snapshots.listRecent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      fromBusinessDate: new Date('2026-06-17T00:00:00.000Z'),
      toBusinessDate: BUSINESS_DATE,
      limit: 30,
    });
  });

  it('calls LinkFox once only for an explicitly allowlisted pilot organization', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', ORGANIZATION_ID);
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', 'US');

    const result = await service.collect(input, NOW);

    expect(linkfox.fetchNewProductRank).toHaveBeenCalledTimes(1);
    expect(linkfox.fetchNewProductRank).toHaveBeenCalledWith({
      date: '2026-07-16',
      region: 'US',
      pageSize: 50,
    });
    const payload = result.snapshot!.payload as MarketShadowSnapshotPayload;
    expect(payload.input.sources).toEqual([
      'google-trends-rss',
      'linkfox-echotik-new-product-rank',
    ]);
    expect(payload.result).toMatchObject({
      status: 'complete',
      decisionImpact: 'disabled',
      evaluation: {
        linkfoxEchoTik: {
          status: 'complete',
          region: 'US',
          productCount: 1,
          relevantProductCount: 1,
          freshProductCount: 1,
          evidenceCompleteness: 1,
          costPoints: 4.5,
          relevanceLabels: ['필기구·학용품'],
        },
        pairedComparison: {
          controlEvidenceGroupCount: 4,
          treatmentProductCount: 1,
          overlapCount: 1,
          novelRelevantCount: 0,
          freshCount: 1,
          evidenceCompleteness: 1,
          costPoints: 4.5,
        },
      },
    });
  });

  it('does not spend credits for non-pilot organizations', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', 'another-org');
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', 'US');
    const result = await service.collect(input, NOW);
    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
    expect(
      (result.snapshot!.payload as MarketShadowSnapshotPayload).result.evaluation.linkfoxEchoTik
        .status,
    ).toBe('not_in_pilot');
  });

  it('fails missing region without paid IO or a partial snapshot', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', ORGANIZATION_ID);
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', '');
    const result = await service.collect(input, NOW);
    expect(result).toMatchObject({ state: 'FAILED', snapshot: null });
    expect(result.errorMessage).toContain('SOURCING_LINKFOX_ECHOTIK_REGION');
    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
  });

  it('does not retry a paid failure and stores only its sanitized error', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', ORGANIZATION_ID);
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', 'US');
    vi.mocked(linkfox.fetchNewProductRank).mockRejectedValue(
      new Error('api_key=paid-secret-token quota exhausted'),
    );
    expect(await service.collect(input, NOW)).toMatchObject({
      state: 'FAILED',
      snapshot: null,
      errorMessage: 'linkfox-echotik-new-product-rank: api_key=[REDACTED] quota exhausted',
    });
    expect(linkfox.fetchNewProductRank).toHaveBeenCalledTimes(1);
  });

  it.each([29, 30])('preserves %i observed days and disabled decisions', async (days) => {
    vi.mocked(snapshots.listRecent).mockResolvedValue(
      Array.from({ length: days }, (_, index) => ({
        ...row({}),
        id: `snapshot-${index}`,
        businessDate: new Date(BUSINESS_DATE.getTime() - index * 24 * 60 * 60 * 1000),
      })),
    );

    const result = await service.collect(input, NOW);

    const payload = result.snapshot!.payload as MarketShadowSnapshotPayload;
    expect(payload.result.evaluation.promotionGate).toEqual({
      minimumObservationDays: 30,
      observedDays: days,
      reviewReady: days === 30,
      eligible: false,
    });
    expect(payload.result.decisionImpact).toBe('disabled');
  });
});

function trendRepository(): TrendCollectionRepositoryPort {
  return {
    listSeeds: vi.fn(async () => [
      {
        id: 'seed-1',
        organizationId: ORGANIZATION_ID,
        keyword: '산리오',
        keywordCn: null,
        sources: ['naver'],
        enabled: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]),
    upsertSeedByKeyword: vi.fn(),
    updateSeed: vi.fn(),
    deleteSeed: vi.fn(),
    findNaverKeywordHistory: vi.fn(async () => [
      {
        keyword: '캐릭터 필통',
        businessDate: BUSINESS_DATE,
        monthlyTotalSearchCount: 1000,
        monthlyPcSearchCount: 100,
        monthlyMobileSearchCount: 900,
        competitionIndex: '중간',
        averageAdRank: 3,
        trendRatio: 80,
        trendDelta: 10,
        capturedAt: NOW,
      },
    ]),
    findPopularKeywordHistory: vi.fn(async () => ({
      rows: [
        {
          boardKey: 'stationery',
          boardLabel: '문구',
          cid: null,
          businessDate: BUSINESS_DATE,
          rank: 1,
          keyword: '필통',
          linkId: null,
        },
      ],
      coverage: [],
    })),
    findKeywordAnalysisSnapshot: vi.fn(async () => null),
    findLatestCompleteTrendScope: vi.fn(async () => null),
    find1688HotHistory: vi.fn(async () => [
      {
        businessDate: BUSINESS_DATE,
        capturedAt: NOW,
        offerId: 'offer-1',
        sourceKeyword: '儿童笔袋',
        rank: 1,
        title: '儿童卡通笔袋',
        priceCny: 10,
        monthlySales: 100,
        repurchaseRate: '30%',
        tradeScore: '80',
        supplierName: '공장',
        imageUrl: null,
        sourceUrl: 'https://detail.1688.com/offer/1.html',
      },
    ]),
    findShortsHistory: vi.fn(async () => [
      {
        businessDate: BUSINESS_DATE,
        capturedAt: NOW,
        videoKey: 'short-1',
        rank: 1,
        title: '캐릭터 필통 언박싱',
        channelName: '문구채널',
        viewCount: 100,
        likeCount: 10,
        commentCount: 1,
        keyword: '필통',
        publishedAt: NOW,
        thumbnailUrl: null,
        videoUrl: null,
      },
    ]),
    findShortsHistoryWithCoverage: vi.fn(async () => ({ rows: [], coverage: [] })),
  };
}

function linkfoxProvider(): LinkfoxEchotikShadowPort {
  return {
    fetchNewProductRank: vi.fn(async () => ({
      source: 'linkfox-echotik-new-product-rank',
      generatedAt: NOW.toISOString(),
      date: '2026-07-16',
      region: 'US',
      pageSize: 50,
      total: 1,
      costToken: 4.5,
      products: [
        {
          asin: 'B000TEST',
          title: 'Kids pencil case stationery set',
          region: 'US',
          price: 12.5,
          minPrice: 10,
          maxPrice: 15,
          currency: 'USD',
          totalSaleCnt: 100,
          totalSale30dCnt: 80,
          gmv: 1000,
          salesTrendFlagText: 'new trending stationery',
          videoCount: 8,
          liveCount: 2,
          influencerCount: 4,
          commission: 10,
          rating: 4.8,
          reviewCount: 20,
          availableDate: '2026-07-10',
          categoryId: 'stationery',
          imageUrls: ['https://example.test/product.png'],
          raw: {},
        },
      ],
    })),
  };
}

function row(payload: Record<string, unknown>): MarketShadowSnapshotRow {
  return {
    id: 'snapshot-1',
    organizationId: ORGANIZATION_ID,
    businessDate: BUSINESS_DATE,
    payload,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
