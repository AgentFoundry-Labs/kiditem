import { describe, it, expect, beforeEach } from 'vitest';
import { AdExposureService } from '../ad-exposure.service';
import type { ExposureScoreInput, HydratedListing, InventoryRow } from '../types';
import type { ExposureProductScore } from '@kiditem/shared';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const listing: HydratedListing = {
  id: 'L1',
  externalId: 'EXT-1',
  channelName: '쿠팡 등록명',
  masterProduct: {
    id: 'M1',
    code: 'M-00000001',
    name: '테스트 상품',
    abcGrade: 'A',
    adTier: '1차',
    healthScore: 80,
  },
  primaryOption: null,
};

const baseInv: InventoryRow = {
  optionId: 'O1',
  listingId: 'L1',
  availableStock: 50,
  costPrice: 5000,
  sellPrice: 10000,
  commissionRate: null,
};

// 모든 score 가 만점에 가깝게 나오는 ideal input (각 score 가 70+ 이도록).
const idealInput: ExposureScoreInput = {
  listing,
  metrics: {
    listingId: 'L1',
    metrics: {
      spend: 10000,
      impressions: 10000,
      clicks: 100,
      conversions: 10,
      revenue: 70000,
      ctr: 0.01, // 1.0% (* 100 = 1.0 ≥ 0.5 → ctrScore 30)
      roas: 700, // ≥650 → roasScore 40
      cvr: 0.1, // 10% (* 100 = 10 ≥ 5 → cvrScore 30) — sum=100 → cap
    },
  },
  inventory: { ...baseInv, availableStock: 100 },
  reviewStats: { totalReviews: 100, recentReviews: 20, avgRating: 5 },
  trafficContext: { maxT14: 100000, t14Rev: 100000, t14PrevRev: 50000, t14Orders: 50 },
  fulfillmentContext: { leadTime: 0, profitRate: 20 },
};

const buildInput = (overrides: Partial<ExposureScoreInput> = {}): ExposureScoreInput => ({
  ...idealInput,
  ...overrides,
});

// ─────────────────────────────────────────────
// calculateScores — 5 score 경계값 + return shape
// ─────────────────────────────────────────────

describe('AdExposureService.calculateScores', () => {
  let service: AdExposureService;
  beforeEach(() => {
    service = new AdExposureService();
  });

  it('returns ExposureProductScore with 5 factors + correct weights + listing-primary shape', () => {
    const result = service.calculateScores(idealInput);
    expect(result.factors).toHaveLength(5);
    expect(result.factors.map((f) => f.factor)).toEqual([
      'sales',
      'review',
      'ad',
      'fulfillment',
      'info',
    ]);
    expect(result.factors.map((f) => f.weight)).toEqual([0.25, 0.2, 0.25, 0.2, 0.1]);
    expect(result.listing.listingId).toBe('L1');
    expect(result.listing.option).toBeNull(); // toListingSummary util 동작
    expect(result.grade).toBe('A');
  });

  it('totalScore = round(weighted sum) with 0.25/0.2/0.25/0.2/0.1 weights', () => {
    // sales=80, review=20, ad=40, fulfillment=60, info=10 → 80*.25+20*.2+40*.25+60*.2+10*.1 = 20+4+10+12+1 = 47
    const result = service.calculateScores({
      ...idealInput,
      reviewStats: { totalReviews: 1, recentReviews: 0, avgRating: 0 }, // totalRev=10, recent=0, rating=0 → 10
      metrics: {
        listingId: 'L1',
        metrics: { spend: 10000, impressions: 10000, clicks: 30, conversions: 0, revenue: 20000, ctr: 0.003, roas: 200, cvr: 0 },
      }, // spend>0 → no skip; roas=200 → 20, ctr=0.3 → 20, cvr=0 → 0 → adScore=40
      fulfillmentContext: { leadTime: 0, profitRate: 0 }, // leadScore=40, stock=100>50 → 30, profit≥0 → 10 → fulfillment=80? wait stock from inventory
      inventory: { ...baseInv, availableStock: 100 }, // stock=100 → stockScore=30
      // info: healthScore=80, adTier='1차' → 80+20=100 → cap 100
    });
    // sales (idealInput trafficContext): maxT14=100000, t14Rev=100000, prev=50000 (>1.1 → 20), orders=50>0 → 20
    //   t14Pct = (100000/100000)*60 = 60; growth=20; orders=20 → sum=100 → cap 100
    // review: 10 (already computed)
    // ad: 40 (computed above)
    // fulfillment: lead=40 (leadTime=0), stock=30 (>50), profit=10 (≥0) → 80
    // info: 100
    // total = 100*.25 + 10*.2 + 40*.25 + 80*.2 + 100*.1 = 25+2+10+16+10 = 63
    expect(result.totalScore).toBe(63);
  });

  it('calculateAdScore returns 50 when spend=0 (광고 OFF 중립값)', () => {
    const result = service.calculateScores({
      ...idealInput,
      metrics: {
        listingId: 'L1',
        metrics: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, ctr: 0, roas: 0, cvr: 0 },
      },
    });
    const adFactor = result.factors.find((f) => f.factor === 'ad')!;
    expect(adFactor.score).toBe(50);
  });

  it('calculateReviewScore boundary: totalReviews=50 → totalRevScore=40, recent=10 → 40, rating=5 → 20 → cap 100', () => {
    const result = service.calculateScores({
      ...idealInput,
      reviewStats: { totalReviews: 50, recentReviews: 10, avgRating: 5 },
    });
    const reviewFactor = result.factors.find((f) => f.factor === 'review')!;
    expect(reviewFactor.score).toBe(100);
  });

  it('calculateReviewScore zero: returns 0 for empty reviews', () => {
    const result = service.calculateScores({
      ...idealInput,
      reviewStats: { totalReviews: 0, recentReviews: 0, avgRating: 0 },
    });
    const reviewFactor = result.factors.find((f) => f.factor === 'review')!;
    expect(reviewFactor.score).toBe(0);
  });

  it('calculateFulfillmentScore: leadTime=null → 20 (정보 없음 중립)', () => {
    const result = service.calculateScores({
      ...idealInput,
      inventory: { ...baseInv, availableStock: 0 },
      fulfillmentContext: { leadTime: null, profitRate: -5 },
    });
    const fulfillmentFactor = result.factors.find((f) => f.factor === 'fulfillment')!;
    // leadScore=20 (null), stockScore=0 (stock=0), profitScore=0 (profitRate < 0)
    expect(fulfillmentFactor.score).toBe(20);
  });

  it('calculateFulfillmentScore: leadTime≥3 → 10', () => {
    const result = service.calculateScores({
      ...idealInput,
      fulfillmentContext: { leadTime: 5, profitRate: 15 },
    });
    const fulfillmentFactor = result.factors.find((f) => f.factor === 'fulfillment')!;
    // leadScore=10, stock=100>50 → 30, profit>10 → 30 → 70
    expect(fulfillmentFactor.score).toBe(70);
  });

  it('calculateInfoScore: healthScore null + adTier null → 0', () => {
    const listingNoMeta: HydratedListing = {
      ...listing,
      masterProduct: { ...listing.masterProduct, healthScore: null, adTier: null },
    };
    const result = service.calculateScores({ ...idealInput, listing: listingNoMeta });
    const infoFactor = result.factors.find((f) => f.factor === 'info')!;
    expect(infoFactor.score).toBe(0);
  });

  it('calculateInfoScore: healthScore=100 capped at 80, adTier present → 100', () => {
    const listingHigh: HydratedListing = {
      ...listing,
      masterProduct: { ...listing.masterProduct, healthScore: 100, adTier: '1차' },
    };
    const result = service.calculateScores({ ...idealInput, listing: listingHigh });
    const infoFactor = result.factors.find((f) => f.factor === 'info')!;
    expect(infoFactor.score).toBe(100); // 80 (capped) + 20 (adTier)
  });

  it('calculateSalesScore: maxT14=0 → t14Pct=0; t14Orders>0 + t14Rev>0 (no prev) → 30', () => {
    const result = service.calculateScores({
      ...idealInput,
      trafficContext: { maxT14: 0, t14Rev: 1000, t14PrevRev: 0, t14Orders: 5 },
    });
    const salesFactor = result.factors.find((f) => f.factor === 'sales')!;
    // t14Pct=0, growth=10 (t14Rev>0 + prev=0), orders=20 → 30
    expect(salesFactor.score).toBe(30);
  });

  it('calculateSalesScore: growth boundary t14Rev/t14PrevRev=1.0 → growthScore=10', () => {
    const result = service.calculateScores({
      ...idealInput,
      trafficContext: { maxT14: 100000, t14Rev: 50000, t14PrevRev: 50000, t14Orders: 1 },
    });
    const salesFactor = result.factors.find((f) => f.factor === 'sales')!;
    // t14Pct=(50000/100000)*60=30, growth=10 (ratio=1.0), orders=20 → 60
    expect(salesFactor.score).toBe(60);
  });

  it('inventory null → stock defaults to 0 (fulfillment stockScore=0)', () => {
    const result = service.calculateScores({
      ...idealInput,
      inventory: null,
      fulfillmentContext: { leadTime: 0, profitRate: 0 },
    });
    const fulfillmentFactor = result.factors.find((f) => f.factor === 'fulfillment')!;
    // leadScore=40 (leadTime=0), stockScore=0, profitScore=10 (≥0) → 50
    expect(fulfillmentFactor.score).toBe(50);
  });

  it('reviewStats null → all review scores zero', () => {
    const result = service.calculateScores({ ...idealInput, reviewStats: null });
    const reviewFactor = result.factors.find((f) => f.factor === 'review')!;
    expect(reviewFactor.score).toBe(0);
  });

  it('topIssue 가 calculateScores 결과에 포함됨 (가장 낮은 score 의 label)', () => {
    const result = service.calculateScores({
      ...idealInput,
      reviewStats: { totalReviews: 0, recentReviews: 0, avgRating: 0 }, // review=0 → worst
    });
    expect(result.topIssue).toBe('리뷰 부족');
  });
});

// ─────────────────────────────────────────────
// determineTopIssue — worst score → label, all-good → null
// ─────────────────────────────────────────────

describe('AdExposureService.determineTopIssue', () => {
  let service: AdExposureService;
  beforeEach(() => {
    service = new AdExposureService();
  });

  it('returns label of lowest score (review)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 80, review: 30, ad: 70, fulfillment: 60, info: 90 },
    });
    expect(result).toBe('리뷰 부족');
  });

  it('returns label of lowest score (sales)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 10, review: 70, ad: 70, fulfillment: 70, info: 70 },
    });
    expect(result).toBe('매출 부진');
  });

  it('returns label of lowest score (ad)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 70, review: 70, ad: 20, fulfillment: 70, info: 70 },
    });
    expect(result).toBe('광고 비효율');
  });

  it('returns label of lowest score (fulfillment)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 80, review: 80, ad: 80, fulfillment: 30, info: 80 },
    });
    expect(result).toBe('배송/재고 이슈');
  });

  it('returns label of lowest score (info)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 80, review: 80, ad: 80, fulfillment: 80, info: 25 },
    });
    expect(result).toBe('상품 정보 미흡');
  });

  it('returns null when all scores >= 70 (양호)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 70, review: 80, ad: 90, fulfillment: 75, info: 85 },
    });
    expect(result).toBeNull();
  });

  it('boundary: score=70 → null (>=70 양호 기준)', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 70, review: 70, ad: 70, fulfillment: 70, info: 70 },
    });
    expect(result).toBeNull();
  });

  it('boundary: score=69 → topIssue 반환', () => {
    const result = service.determineTopIssue({
      listing,
      scores: { sales: 69, review: 80, ad: 80, fulfillment: 80, info: 80 },
    });
    expect(result).toBe('매출 부진');
  });
});

// ─────────────────────────────────────────────
// assembleExposureData — sort + urgentActions 추출
// ─────────────────────────────────────────────

describe('AdExposureService.assembleExposureData', () => {
  let service: AdExposureService;
  beforeEach(() => {
    service = new AdExposureService();
  });

  const buildScore = (
    listingId: string,
    totalScore: number,
    topIssue: string | null,
  ): ExposureProductScore => ({
    listing: {
      listingId,
      externalId: `EXT-${listingId}`,
      channelName: null,
      masterProduct: { id: `M-${listingId}`, code: `M-${listingId}`, name: `Product ${listingId}` },
      option: null,
    },
    grade: 'A',
    factors: [],
    totalScore,
    topIssue,
  });

  it('sorts scores ascending by totalScore', () => {
    const result = service.assembleExposureData([
      buildScore('L1', 80, null),
      buildScore('L2', 30, '매출 부진'),
      buildScore('L3', 50, '리뷰 부족'),
    ]);
    expect(result.scores.map((s) => s.listing.listingId)).toEqual(['L2', 'L3', 'L1']);
  });

  it('extracts urgentActions for totalScore < 40 with non-null topIssue', () => {
    const result = service.assembleExposureData([
      buildScore('L1', 30, '매출 부진'), // urgent
      buildScore('L2', 80, null), // skip (>= 40 + null topIssue)
      buildScore('L3', 39, '리뷰 부족'), // urgent (39 < 40)
      buildScore('L4', 40, '광고 비효율'), // skip (=40 boundary, not <)
    ]);
    expect(result.urgentActions).toHaveLength(2);
    expect(result.urgentActions[0].listing.listingId).toBe('L1');
    expect(result.urgentActions[1].listing.listingId).toBe('L3');
  });

  it('urgentAction includes suggestedAction matching the topIssue label', () => {
    const result = service.assembleExposureData([buildScore('L1', 20, '리뷰 부족')]);
    expect(result.urgentActions[0].suggestedAction).toBe('리뷰 수집 캠페인 (구매 후 리뷰 요청)');
  });

  it('skips score with totalScore < 40 but null topIssue', () => {
    const result = service.assembleExposureData([buildScore('L1', 20, null)]);
    expect(result.urgentActions).toHaveLength(0);
  });

  it('caps urgentActions at 30 entries', () => {
    const scores = Array.from({ length: 50 }, (_, i) => buildScore(`L${i}`, 10, '매출 부진'));
    const result = service.assembleExposureData(scores);
    expect(result.urgentActions).toHaveLength(30);
  });

  it('returns empty urgentActions when all scores >= 40', () => {
    const result = service.assembleExposureData([
      buildScore('L1', 50, '매출 부진'),
      buildScore('L2', 80, null),
    ]);
    expect(result.urgentActions).toHaveLength(0);
    expect(result.scores).toHaveLength(2);
  });

  it('input scores 배열을 mutate 하지 않음 (순수성)', () => {
    const original = [buildScore('L1', 80, null), buildScore('L2', 30, '매출 부진')];
    const snapshot = [...original];
    service.assembleExposureData(original);
    expect(original).toEqual(snapshot); // input 순서 보존
  });
});
