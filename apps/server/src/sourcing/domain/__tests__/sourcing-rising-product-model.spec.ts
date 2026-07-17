import { describe, expect, it } from 'vitest';
import {
  buildSourcingRisingProductModel,
  isSourcingRisingProductModelPayload,
  SOURCING_RISING_PRODUCT_MODEL_VERSION,
  type RisingSerpItemInput,
  type RisingSerpSnapshotInput,
  type RisingWingSalesInput,
} from '../sourcing-rising-product-model';

const TODAY = '2026-07-16';
const DAYS = ['2026-07-14', '2026-07-15', '2026-07-16'] as const;

function item(overrides: Partial<RisingSerpItemInput>): RisingSerpItemInput {
  return {
    isAd: false,
    rank: null,
    productId: null,
    vendorItemId: null,
    name: null,
    priceKrw: null,
    reviewCount: null,
    ratingScore: null,
    link: null,
    ...overrides,
  };
}

/** Build a keyword's daily snapshots from per-day item lists. */
function snapshots(
  keyword: string,
  perDay: RisingSerpItemInput[][],
): RisingSerpSnapshotInput[] {
  return perDay.map((items, index) => ({
    keyword,
    businessDate: DAYS[index],
    items,
  }));
}

describe('buildSourcingRisingProductModel', () => {
  it('ranks a review-growing, rank-climbing, young product as a top rising candidate', () => {
    const rising = [
      [item({ vendorItemId: 'V1', name: '아기 물티슈 리필', rank: 30, reviewCount: 40, priceKrw: 9900, link: 'https://coupang.com/vp/products/1' })],
      [item({ vendorItemId: 'V1', name: '아기 물티슈 리필', rank: 20, reviewCount: 60, priceKrw: 9900 })],
      [item({ vendorItemId: 'V1', name: '아기 물티슈 리필', rank: 12, reviewCount: 95, priceKrw: 9900 })],
    ];
    const flat = [
      [item({ vendorItemId: 'V2', name: '물티슈 대용량', rank: 15, reviewCount: 5000 })],
      [item({ vendorItemId: 'V2', name: '물티슈 대용량', rank: 15, reviewCount: 5000 })],
      [item({ vendorItemId: 'V2', name: '물티슈 대용량', rank: 15, reviewCount: 5000 })],
    ];
    const result = buildSourcingRisingProductModel({
      serpSnapshots: snapshots('아기 물티슈', rising.map((r, i) => [...r, ...flat[i]])),
      trends: [{ keyword: '아기 물티슈', trendDelta: 20, monthlyTotalSearchCount: 30000 }],
      todayBusinessDate: TODAY,
    });

    const v1 = result.candidates.find((c) => c.vendorItemId === 'V1');
    const v2 = result.candidates.find((c) => c.vendorItemId === 'V2');
    expect(v1).toBeDefined();
    expect(v1!.rank).toBe(1);
    expect(v1!.score).toBeGreaterThan(v2!.score);
    expect(['A', 'B']).toContain(v1!.grade);
    expect(v1!.signals.reviewVelocityPerDay).toBeGreaterThan(0);
    expect(v1!.signals.rankClimb).toBe(18);
    expect(v2!.grade).toBe('EXCLUDE');
    expect(v2!.risks).toContain('쿠팡 리뷰 장벽');
  });

  it('drops products with only one observation and counts them', () => {
    const result = buildSourcingRisingProductModel({
      serpSnapshots: [
        { keyword: '블록 장난감', businessDate: DAYS[2], items: [item({ vendorItemId: 'SOLO', name: '블록', rank: 10, reviewCount: 12 })] },
      ],
      todayBusinessDate: TODAY,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.stats.insufficientHistoryCount).toBe(1);
  });

  it('downgrades a candidate when Wing real sales are declining', () => {
    const serp = snapshots('스티커 문구', [
      [item({ vendorItemId: 'W1', name: '캐릭터 스티커', rank: 8, reviewCount: 50 })],
      [item({ vendorItemId: 'W1', name: '캐릭터 스티커', rank: 6, reviewCount: 80 })],
      [item({ vendorItemId: 'W1', name: '캐릭터 스티커', rank: 4, reviewCount: 130 })],
    ]);
    const decliningWing: RisingWingSalesInput[] = [
      { keyword: '스티커 문구', businessDate: DAYS[0], vendorItemId: 'W1', salesLast28d: 900, salesRank: 3, salePrice: 5000, reviewCount: 50 },
      { keyword: '스티커 문구', businessDate: DAYS[2], vendorItemId: 'W1', salesLast28d: 400, salesRank: 12, salePrice: 5000, reviewCount: 130 },
    ];
    const withDecline = buildSourcingRisingProductModel({ serpSnapshots: serp, wingSales: decliningWing, todayBusinessDate: TODAY });
    const w1 = withDecline.candidates.find((c) => c.vendorItemId === 'W1')!;
    expect(w1.signals.hasWingSales).toBe(true);
    expect(w1.signals.salesVelocityPerDay).toBeLessThan(0);
    expect(w1.grade).not.toBe('A');
    expect(w1.decision).not.toBe('order');
  });

  it('flags ad-only products that never appear organically', () => {
    const adOnly = snapshots('퍼즐', [
      [item({ vendorItemId: 'AD1', name: '퍼즐 세트', isAd: true, rank: 3, reviewCount: 200 })],
      [item({ vendorItemId: 'AD1', name: '퍼즐 세트', isAd: true, rank: 3, reviewCount: 230 })],
      [item({ vendorItemId: 'AD1', name: '퍼즐 세트', isAd: true, rank: 3, reviewCount: 260 })],
    ]);
    const result = buildSourcingRisingProductModel({ serpSnapshots: adOnly, todayBusinessDate: TODAY });
    const ad1 = result.candidates.find((c) => c.vendorItemId === 'AD1')!;
    expect(ad1.signals.rankClimb).toBeNull();
    expect(ad1.risks.some((r) => r.includes('광고 노출'))).toBe(true);
    expect(ad1.modelTags).toContain('wing:proxy-only');
  });

  it('keeps a single representative per product across multiple keywords', () => {
    const strong = snapshots('공룡 장난감', [
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 25, reviewCount: 20 })],
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 14, reviewCount: 45 })],
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 9, reviewCount: 88 })],
    ]);
    const weak = snapshots('공룡', [
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 40, reviewCount: 85 })],
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 41, reviewCount: 86 })],
      [item({ vendorItemId: 'DUP', name: '공룡 피규어', rank: 42, reviewCount: 88 })],
    ]);
    const result = buildSourcingRisingProductModel({
      serpSnapshots: [...strong, ...weak],
      trends: [{ keyword: '공룡 장난감', trendDelta: 15, monthlyTotalSearchCount: 12000 }],
      todayBusinessDate: TODAY,
    });
    const dups = result.candidates.filter((c) => c.vendorItemId === 'DUP');
    expect(dups).toHaveLength(1);
    expect(dups[0].keyword).toBe('공룡 장난감');
  });

  it('produces a persistable payload recognised by the guard', () => {
    const result = buildSourcingRisingProductModel({
      serpSnapshots: snapshots('자석 블록', [
        [item({ vendorItemId: 'M1', name: '자석 블록', rank: 18, reviewCount: 30 })],
        [item({ vendorItemId: 'M1', name: '자석 블록', rank: 11, reviewCount: 70 })],
      ]),
      todayBusinessDate: TODAY,
    });
    const payload = {
      version: SOURCING_RISING_PRODUCT_MODEL_VERSION,
      result,
      meta: { generatedAt: '2026-07-16T00:00:00.000Z' },
    };
    expect(isSourcingRisingProductModelPayload(payload)).toBe(true);
    expect(isSourcingRisingProductModelPayload({ version: 2, result, meta: {} })).toBe(false);
  });
});
