import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrendCollectionRepositoryPort } from '../../port/out/repository/trend-collection.repository.port';
import { SourcingMarketDiscoveryService } from '../sourcing-market-discovery.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-07-15T00:00:00.000Z');
const CAPTURED_AT = new Date('2026-07-15T01:00:00.000Z');

describe('SourcingMarketDiscoveryService', () => {
  let trends: TrendCollectionRepositoryPort;
  let recommendations: ReturnType<typeof recommendationService>;
  let service: SourcingMarketDiscoveryService;

  beforeEach(() => {
    trends = trendRepository();
    recommendations = recommendationService();
    service = new SourcingMarketDiscoveryService(trends, recommendations as never);
  });

  it('replays typed trend facts and the canonical recommendation run without workspace JSON', async () => {
    const result = await service.discover({
      organizationId: ORGANIZATION_ID,
      keyword: '실리콘 식판',
      category: '유아식기',
    });

    expect(trends.findNaverKeywordHistory).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      days: 30,
    });
    expect(recommendations.latest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      surface: 'home',
      limit: 100,
    });
    expect(result.mode).toBe('replay');
    expect(result.windowDays).toBe(30);
    expect(result.confidence).toBe(1);
    expect(result.dataGaps).toEqual([]);
    expect(result.marketSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'naver_keyword', keyword: '실리콘 식판' }),
      expect.objectContaining({ source: 'naver_popular', keyword: '실리콘 식판' }),
      expect.objectContaining({ source: '1688_hot', offerId: 'hot-offer-1' }),
      expect.objectContaining({ source: 'shorts', videoKey: 'short-1' }),
    ]));
    expect(result.coupangMatches[0]).toEqual(expect.objectContaining({
      productId: 'coupang-product-1',
      productName: '실리콘 식판 흡착 세트',
    }));
    expect(result.supplierMatches[0]).toEqual(expect.objectContaining({
      offerId: 'workspace-offer-1',
      sourceUrl: 'https://detail.1688.com/offer/1688001.html',
      matchedCoupang: expect.objectContaining({ productId: 'coupang-product-1' }),
    }));
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual(expect.objectContaining({
      productName: '儿童硅胶吸盘餐盘 실리콘 식판',
      coupangEvidence: expect.objectContaining({ productId: 'coupang-product-1' }),
      supplierEvidence: expect.objectContaining({ supplierName: '이우 유아식기 공장' }),
    }));
  });

  it('returns explicit gaps instead of creating a synthetic fallback when the run is unavailable', async () => {
    trends = trendRepository({ empty: true });
    recommendations = recommendationService({ unavailable: true });
    service = new SourcingMarketDiscoveryService(trends, recommendations as never);

    const result = await service.discover({
      organizationId: ORGANIZATION_ID,
      keyword: '근거 없는 키워드',
    });

    expect(result.marketSignals).toEqual([]);
    expect(result.coupangMatches).toEqual([]);
    expect(result.trackingSnapshots).toEqual([]);
    expect(result.supplierMatches).toEqual([]);
    expect(result.scoredOpportunities).toEqual([]);
    expect(result.recommendations).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.dataGaps).toEqual([
      'naver_keyword_history_missing',
      'naver_popular_history_missing',
      '1688_history_missing',
      'shorts_history_missing',
      'coupang_recommendation_evidence_missing',
      '1688_supplier_evidence_missing',
      'coupang_supplier_cross_evidence_missing',
    ]);
  });

  it('does not create a recommendation from supplier evidence without Coupang evidence', async () => {
    trends = trendRepository({ empty: true });
    recommendations = recommendationService({ supplierOnly: true });
    service = new SourcingMarketDiscoveryService(trends, recommendations as never);

    const result = await service.discover({
      organizationId: ORGANIZATION_ID,
      keyword: '실리콘 식판',
      mode: 'replay',
    });

    expect(result.supplierMatches).toHaveLength(1);
    expect(result.supplierMatches[0].matchedCoupang).toBeNull();
    expect(result.recommendations).toEqual([]);
    expect(result.dataGaps).toContain('coupang_supplier_cross_evidence_missing');
  });
});

function trendRepository(input: { empty?: boolean } = {}): TrendCollectionRepositoryPort {
  const empty = input.empty === true;
  return {
    listSeeds: vi.fn(async () => []),
    upsertSeedByKeyword: vi.fn(),
    updateSeed: vi.fn(),
    deleteSeed: vi.fn(),
    findNaverKeywordHistory: vi.fn(async () => empty ? [] : [{
      keyword: '실리콘 식판',
      businessDate: BUSINESS_DATE,
      monthlyTotalSearchCount: 18000,
      monthlyPcSearchCount: 2000,
      monthlyMobileSearchCount: 16000,
      competitionIndex: '중간',
      averageAdRank: 3.2,
      trendRatio: 84,
      trendDelta: 12,
      capturedAt: CAPTURED_AT,
    }]),
    findPopularKeywordHistory: vi.fn(async () => ({ rows: empty ? [] : [{
      boardKey: 'kids-tableware',
      boardLabel: '유아식기',
      cid: '50000001',
      businessDate: BUSINESS_DATE,
      rank: 4,
      keyword: '실리콘 식판',
      linkId: 'keyword-1',
    }], coverage: [] })),
    findKeywordAnalysisSnapshot: vi.fn(async () => null),
    findLatestCompleteTrendScope: vi.fn(async () => null),
    find1688HotHistory: vi.fn(async () => empty ? [] : [{
      businessDate: BUSINESS_DATE,
      capturedAt: CAPTURED_AT,
      offerId: 'hot-offer-1',
      sourceKeyword: '실리콘 식판',
      rank: 2,
      title: '儿童硅胶餐盘 실리콘 식판',
      priceCny: 18,
      monthlySales: 440,
      repurchaseRate: '32%',
      tradeScore: '78',
      supplierName: '이우 식기 공장',
      imageUrl: 'https://example.test/hot.png',
      sourceUrl: 'https://detail.1688.com/offer/1688999.html',
    }]),
    findShortsHistory: vi.fn(async () => empty ? [] : [{
      businessDate: BUSINESS_DATE,
      capturedAt: CAPTURED_AT,
      videoKey: 'short-1',
      rank: 3,
      title: '아기 실리콘 식판 사용법',
      channelName: '육아랩',
      viewCount: 82000,
      likeCount: 3400,
      commentCount: 110,
      keyword: '실리콘 식판',
      publishedAt: new Date('2026-07-12T00:00:00.000Z'),
      thumbnailUrl: 'https://example.test/short.png',
      videoUrl: 'https://youtube.test/short-1',
    }]),
    findShortsHistoryWithCoverage: vi.fn(async () => ({ rows: [], coverage: [] })),
  };
}

function recommendationService(input: { unavailable?: boolean; supplierOnly?: boolean } = {}) {
  const items = input.unavailable
    ? []
    : [supplierItem(), ...(input.supplierOnly ? [] : [coupangItem()])];
  return {
    latest: vi.fn(async () => input.unavailable
      ? {
          ready: false,
          generatedAt: CAPTURED_AT.toISOString(),
          lastSuccessfulAt: null,
          freshUntil: null,
          operationId: null,
          warnings: [],
          error: { code: 'RECOMMENDATION_RUN_MISSING', retryable: true, message: 'missing' },
          data: null,
        }
      : {
          ready: true,
          generatedAt: CAPTURED_AT.toISOString(),
          lastSuccessfulAt: CAPTURED_AT.toISOString(),
          freshUntil: null,
          operationId: null,
          warnings: [],
          error: null,
          data: {
            runId: '00000000-0000-4000-8000-000000000090',
            items,
            nextCursor: null,
          },
        }),
  };
}

function supplierItem() {
  return {
    itemKey: 'a'.repeat(64),
    sourcePlatform: '1688' as const,
    externalOfferId: 'workspace-offer-1',
    variantKey: '',
    rank: 1,
    score: 86,
    grade: 'A' as const,
    baselineAction: 'order' as const,
    reasonCodes: ['margin_positive'],
    riskCodes: [],
    displayName: '儿童硅胶吸盘餐盘 실리콘 식판',
    keyword: '실리콘 식판',
    isNewKeyword: false,
    imageUrl: 'https://example.test/1688.png',
    sourceUrl: 'https://detail.1688.com/offer/1688001.html',
    overseasPriceCny: 16,
    overseasPriceKrw: null,
    salePriceKrw: null,
    supplierName: '이우 유아식기 공장',
    monthlySales: null,
    repurchaseRate: null,
    tradeScore: null,
    minOrderQuantity: null,
    estimatedMarginRate: 38,
    estimatedProfitKrw: null,
    shippingLabel: null,
    rating: null,
    tags: [],
    sourceKeywords: ['실리콘 식판'],
    offerObservationIds: ['00000000-0000-4000-8000-000000000011'],
    scoreComponents: { margin: 80, demand: 80, competition: 50, momentum: 0, supplier: 80 },
    evidenceObservationIds: ['00000000-0000-4000-8000-000000000012'],
    coupang: null,
    interest: null,
    contributingSources: ['supply_1688_new'],
  };
}

function coupangItem() {
  return {
    itemKey: 'b'.repeat(64),
    sourcePlatform: 'coupang' as const,
    externalOfferId: 'coupang-product-1',
    variantKey: 'item-1',
    rank: 2,
    score: 88,
    grade: 'A' as const,
    baselineAction: 'order' as const,
    reasonCodes: ['coupang_sales_observed'],
    riskCodes: [],
    displayName: '실리콘 식판 흡착 세트',
    keyword: '실리콘 식판',
    isNewKeyword: false,
    imageUrl: null,
    sourceUrl: null,
    overseasPriceCny: null,
    overseasPriceKrw: null,
    salePriceKrw: 15900,
    supplierName: null,
    monthlySales: null,
    repurchaseRate: null,
    tradeScore: null,
    minOrderQuantity: null,
    estimatedMarginRate: null,
    estimatedProfitKrw: null,
    shippingLabel: null,
    rating: null,
    tags: [],
    sourceKeywords: ['실리콘 식판'],
    offerObservationIds: [],
    scoreComponents: { sales: 90, views: 80, rating: 94, reviews: 40 },
    evidenceObservationIds: ['00000000-0000-4000-8000-000000000013'],
    coupang: {
      productId: 'coupang-product-1',
      productName: '실리콘 식판 흡착 세트',
      salePriceKrw: 15900,
      ratingCount: 52,
      ratingAverage: 4.7,
      viewsLast28d: 2400,
      salesLast28d: 900,
    },
    interest: null,
    contributingSources: ['coupang_competitor'],
  };
}
