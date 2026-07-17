import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
  SourcingWorkspaceSnapshotScope,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';
import type {
  TrendCollectionRepositoryPort,
} from '../../port/out/repository/trend-collection.repository.port';
import { SourcingMarketDiscoveryService } from '../sourcing-market-discovery.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-07-15T00:00:00.000Z');
const CAPTURED_AT = new Date('2026-07-15T01:00:00.000Z');

describe('SourcingMarketDiscoveryService', () => {
  let trends: TrendCollectionRepositoryPort;
  let snapshots: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingMarketDiscoveryService;

  beforeEach(() => {
    trends = trendRepository();
    snapshots = snapshotRepository();
    service = new SourcingMarketDiscoveryService(trends, snapshots);
  });

  it('replays persisted 30-day evidence through the existing market models', async () => {
    const result = await service.discover({
      organizationId: ORGANIZATION_ID,
      keyword: '실리콘 식판',
      category: '유아식기',
    });

    expect(trends.findNaverKeywordHistory).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      days: 30,
    });
    expect(snapshots.listRecent).toHaveBeenCalledTimes(2);
    expect(snapshots.listRecent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      scope: 'today_recommendations',
      limit: 30,
    }));
    expect(snapshots.listRecent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      scope: '1688_new_products',
      limit: 30,
    }));

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
      score: expect.any(Number),
      components: expect.objectContaining({ marketReaction: expect.any(Number) }),
    }));
    expect(result.supplierMatches[0]).toEqual(expect.objectContaining({
      offerId: 'workspace-offer-1',
      sourceUrl: 'https://detail.1688.com/offer/1688001.html',
      matchedCoupang: expect.objectContaining({ productId: 'coupang-product-1' }),
    }));
    expect(result.scoredOpportunities[0]).toEqual(expect.objectContaining({
      pipeline: '1688_first_new_product_validation',
      score: result.supplierMatches[0].score,
      components: result.supplierMatches[0].components,
    }));
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual(expect.objectContaining({
      id: 'sourcing-recommendation:workspace-offer-1:coupang-product-1',
      productName: '儿童硅胶吸盘餐盘 실리콘 식판',
      score: expect.objectContaining({
        score: result.supplierMatches[0].score,
        components: result.supplierMatches[0].components,
      }),
      coupangEvidence: expect.objectContaining({ productId: 'coupang-product-1' }),
      supplierEvidence: expect.objectContaining({ supplierName: '이우 유아식기 공장' }),
    }));
  });

  it('returns empty arrays and explicit gaps instead of synthetic fallback data', async () => {
    trends = trendRepository({ empty: true });
    snapshots = snapshotRepository({ empty: true });
    service = new SourcingMarketDiscoveryService(trends, snapshots);

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
    snapshots = snapshotRepository({ supplierOnly: true });
    service = new SourcingMarketDiscoveryService(trends, snapshots);

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
    upsertNaverKeywordSnapshots: vi.fn(async () => 0),
    replaceNaverPopularKeywordSnapshots: vi.fn(async () => 0),
    upsert1688HotProductSnapshots: vi.fn(async () => 0),
    upsertShortsSnapshots: vi.fn(async () => 0),
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
    findPopularKeywordHistory: vi.fn(async () => empty ? [] : [{
      boardKey: 'kids-tableware',
      boardLabel: '유아식기',
      cid: '50000001',
      businessDate: BUSINESS_DATE,
      rank: 4,
      keyword: '실리콘 식판',
      linkId: 'keyword-1',
    }]),
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
  };
}

function snapshotRepository(input: { empty?: boolean; supplierOnly?: boolean } = {}): SourcingWorkspaceSnapshotRepositoryPort {
  return {
    find: vi.fn(async () => null),
    listRecent: vi.fn(async ({ scope }) => {
      if (input.empty) return [];
      if (scope === 'today_recommendations') {
        return input.supplierOnly ? [] : [todayRecommendationSnapshot()];
      }
      if (scope === '1688_new_products') return [supplierSnapshot(input.supplierOnly === true)];
      return [];
    }),
    upsert: vi.fn(),
  };
}

function todayRecommendationSnapshot(): SourcingWorkspaceSnapshotRow {
  return row('today_recommendations', {
    version: 1,
    result: {
      rows: [{
        productId: 'coupang-product-1',
        itemId: 'item-1',
        vendorItemId: 'vendor-1',
        productName: '실리콘 식판 흡착 세트',
        primaryKeyword: '실리콘 식판',
        keywords: ['실리콘 식판', '유아식기'],
        score: 88,
        salesLast3d: 284,
        salesLast28d: 900,
        pvLast3d: 2400,
        ratingCount: 52,
        salePrice: 15900,
        marketReactionSignal: 72,
        newEntrySignal: 16,
        salesDelta: 18,
        reviewDelta: 2,
        wholesaleOfferCount: 4,
        wholesaleMatchScore: 82,
        supplierScore: 77,
        risks: [],
      }],
      productSnapshots: [],
    },
  });
}

function supplierSnapshot(supplierOnly: boolean): SourcingWorkspaceSnapshotRow {
  return row('1688_new_products', {
    version: 1,
    input: { keyword: '실리콘 식판' },
    result: {
      keyword: '실리콘 식판',
      items: [{
        offerId: 'workspace-offer-1',
        title: supplierOnly ? '실리콘 식판 공급 상품' : '儿童硅胶吸盘餐盘 실리콘 식판',
        sourceUrl: 'https://detail.1688.com/offer/1688001.html',
        imageUrl: 'https://example.test/1688.png',
        keyword: '실리콘 식판',
        priceCny: 16,
        monthlySales: 920,
        tradeScore: 86,
        repurchaseRate: '39%',
        supplierName: '이우 유아식기 공장',
        shippingFulfillmentRate: '99%',
        shippingPickupRate: '98%',
        landedCostKrw: 6200,
        estimatedProfitKrw: 6100,
        estimatedMarginRate: 38,
        newProductSignal: 92,
        ...(supplierOnly ? {} : {
          imageMatchScore: 93,
          matchedCoupang: {
            productId: 'coupang-product-1',
            productName: '실리콘 식판 흡착 세트',
            primaryKeyword: '실리콘 식판',
            keywords: ['실리콘 식판', '유아식기'],
            score: 88,
            grade: 'A',
            salePrice: 15900,
            salesLast3d: 284,
            salesLast28d: 900,
            reviews: 52,
            marketReaction: 96,
            threeDayValidation: 100,
          },
        }),
      }],
    },
  });
}

function row(
  scope: SourcingWorkspaceSnapshotScope,
  payload: Record<string, unknown>,
): SourcingWorkspaceSnapshotRow {
  return {
    id: `${scope}-snapshot`,
    organizationId: ORGANIZATION_ID,
    scope,
    businessDate: BUSINESS_DATE,
    payload,
    createdAt: BUSINESS_DATE,
    updatedAt: CAPTURED_AT,
  };
}
