import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type MarketShadowSnapshotPayload,
  SourcingShadowSignalService,
} from '../sourcing-shadow-signal.service';
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
  let service: SourcingShadowSignalService;

  beforeEach(() => {
    provider = {
      fetchTrending: vi.fn(async () => ({
        source: 'google-trends-rss',
        generatedAt: NOW.toISOString(),
        items: [{
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
        }],
      })),
    };
    snapshots = snapshotRepository();
    trends = trendRepository();
    linkfox = linkfoxProvider();
    service = new SourcingShadowSignalService(
      provider,
      snapshots,
      trends,
      linkfox,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('claims the KST business date before external IO and stores disabled shadow evaluation', async () => {
    const order: string[] = [];
    vi.mocked(snapshots.claimDaily).mockImplementation(async (input) => {
      order.push('claim');
      return { claimed: true, row: row(input.payload) };
    });
    vi.mocked(provider.fetchTrending).mockImplementation(async () => {
      order.push('external');
      return {
        source: 'google-trends-rss',
        generatedAt: NOW.toISOString(),
        items: [{
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
        }],
      };
    });

    const result = await service.collect(ORGANIZATION_ID, NOW);

    expect(order).toEqual(['claim', 'external']);
    expect(snapshots.claimDaily).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      businessDate: BUSINESS_DATE,
      payload: expect.objectContaining({
        version: 1,
        input: expect.objectContaining({
          experiment: 'paired-shadow-v1',
          sources: ['google-trends-rss'],
          windowDays: 30,
        }),
        result: expect.objectContaining({
          status: 'collecting',
          decisionImpact: 'disabled',
        }),
      }),
    }));
    expect(provider.fetchTrending).toHaveBeenCalledWith(expect.objectContaining({
      seedKeywords: expect.arrayContaining(['필통', '儿童笔袋', '산리오']),
      limit: 100,
    }));
    const finalPayload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(finalPayload.result).toMatchObject({
      status: 'complete',
      decisionImpact: 'disabled',
      evaluation: {
        baseline: {
          evidenceGroupCount: 4,
        },
        googleTrends: {
          signalCount: 1,
          relevantSignalCount: 1,
          relevanceLabels: ['필기구·학용품'],
          overlapLabels: ['필기구·학용품'],
          novelLabels: [],
        },
        promotionGate: {
          minimumObservationDays: 30,
          observedDays: 1,
          eligible: false,
        },
      },
    });
    expect(result.claimed).toBe(true);
    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
  });

  it('returns an existing daily snapshot without any provider or baseline calls', async () => {
    const existing = row({
      version: 1,
      input: {},
      result: { status: 'failed', decisionImpact: 'disabled' },
      meta: {},
    });
    vi.mocked(snapshots.claimDaily).mockResolvedValue({
      claimed: false,
      row: existing,
    });

    const result = await service.collect(ORGANIZATION_ID, NOW);

    expect(result).toEqual({ claimed: false, snapshot: existing });
    expect(provider.fetchTrending).not.toHaveBeenCalled();
    expect(trends.findNaverKeywordHistory).not.toHaveBeenCalled();
    expect(snapshots.finalizeDaily).not.toHaveBeenCalled();
  });

  it('finalizes a partial snapshot and redacts secrets when Google fails', async () => {
    vi.mocked(provider.fetchTrending).mockRejectedValue(
      new Error('Authorization: super-secret-token upstream failed'),
    );

    await service.collect(ORGANIZATION_ID, NOW);

    const payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(payload.result.status).toBe('partial');
    expect(payload.result.sources).toEqual([]);
    expect(payload.result.errors).toEqual([{
      source: 'google-trends-rss',
      message: 'Authorization=[REDACTED] upstream failed',
    }]);
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

    await service.collect(ORGANIZATION_ID, NOW);

    expect(linkfox.fetchNewProductRank).toHaveBeenCalledTimes(1);
    expect(linkfox.fetchNewProductRank).toHaveBeenCalledWith({
      date: '2026-07-16',
      region: 'US',
      pageSize: 50,
    });
    const payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
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

  it('does not spend credits for non-pilot organizations or missing regions', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', 'another-org');
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', 'US');

    await service.collect(ORGANIZATION_ID, NOW);

    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
    let payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(payload.result.evaluation.linkfoxEchoTik.status).toBe('not_in_pilot');

    vi.mocked(snapshots.finalizeDaily).mockClear();
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', ORGANIZATION_ID);
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', '');
    await service.collect(ORGANIZATION_ID, NOW);

    expect(linkfox.fetchNewProductRank).not.toHaveBeenCalled();
    payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(payload.result.status).toBe('partial');
    expect(payload.result.evaluation.linkfoxEchoTik.status).toBe(
      'configuration_error',
    );
    expect(payload.result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'linkfox-echotik-new-product-rank',
        message: expect.stringContaining('SOURCING_LINKFOX_ECHOTIK_REGION'),
      }),
    ]));
  });

  it('stores a sanitized partial result when the paid treatment fails without retrying', async () => {
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '1');
    vi.stubEnv('SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS', ORGANIZATION_ID);
    vi.stubEnv('SOURCING_LINKFOX_ECHOTIK_REGION', 'US');
    vi.mocked(linkfox.fetchNewProductRank).mockRejectedValue(
      new Error('api_key=paid-secret-token quota exhausted'),
    );

    await service.collect(ORGANIZATION_ID, NOW);

    expect(linkfox.fetchNewProductRank).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(payload.result.status).toBe('partial');
    expect(payload.result.evaluation.linkfoxEchoTik.status).toBe('failed');
    expect(payload.result.errors).toEqual(expect.arrayContaining([{
      source: 'linkfox-echotik-new-product-rank',
      message: 'api_key=[REDACTED] quota exhausted',
    }]));
  });

  it('marks 30 observed days ready for review while keeping decision impact disabled', async () => {
    vi.mocked(snapshots.listRecent).mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({
        ...row({}),
        id: `snapshot-${index}`,
        businessDate: new Date(
          BUSINESS_DATE.getTime() - index * 24 * 60 * 60 * 1000,
        ),
      })),
    );

    await service.collect(ORGANIZATION_ID, NOW);

    const payload = vi.mocked(snapshots.finalizeDaily).mock.calls[0][0]
      .payload as MarketShadowSnapshotPayload;
    expect(payload.result.evaluation.promotionGate).toEqual({
      minimumObservationDays: 30,
      observedDays: 30,
      reviewReady: true,
      eligible: false,
    });
    expect(payload.result.decisionImpact).toBe('disabled');
  });
});

function snapshotRepository(): MarketShadowSnapshotRepositoryPort {
  return {
    claimDaily: vi.fn(async (input) => ({
      claimed: true,
      row: row(input.payload),
    })),
    finalizeDaily: vi.fn(async (input) => row(input.payload)),
    listRecent: vi.fn(async () => []),
  };
}

function trendRepository(): TrendCollectionRepositoryPort {
  return {
    listSeeds: vi.fn(async () => [{
      id: 'seed-1',
      organizationId: ORGANIZATION_ID,
      keyword: '산리오',
      keywordCn: null,
      sources: ['naver'],
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    }]),
    upsertSeedByKeyword: vi.fn(),
    updateSeed: vi.fn(),
    deleteSeed: vi.fn(),
    upsertNaverKeywordSnapshots: vi.fn(async () => 0),
    replaceNaverPopularKeywordSnapshots: vi.fn(async () => 0),
    upsert1688HotProductSnapshots: vi.fn(async () => 0),
    upsertShortsSnapshots: vi.fn(async () => 0),
    findNaverKeywordHistory: vi.fn(async () => [{
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
    }]),
    findPopularKeywordHistory: vi.fn(async () => [{
      boardKey: 'stationery',
      boardLabel: '문구',
      cid: null,
      businessDate: BUSINESS_DATE,
      rank: 1,
      keyword: '필통',
      linkId: null,
    }]),
    find1688HotHistory: vi.fn(async () => [{
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
    }]),
    findShortsHistory: vi.fn(async () => [{
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
    }]),
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
      products: [{
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
      }],
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
