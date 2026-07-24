import { describe, expect, it } from 'vitest';

import {
  computeDeadStock,
  computeReorder,
  computeSeasonTag,
  computeTrend,
  detectAnomaly,
} from '../sellpia-product-sales.metrics';

const mm = (arr: [string, number][]) => arr.map(([yearMonth, orderQty]) => ({ yearMonth, orderQty }));

describe('detectAnomaly', () => {
  it('저가(0원) 대량은 큰 달을 이상치로 잡는다 (삼각연필 케이스)', () => {
    const r = detectAnomaly(mm([['2026-02', 100000], ['2026-06', 100000], ['2026-07', 0]]), 0);
    expect(r.anomalyMonths.sort()).toEqual(['2026-02', '2026-06']);
    expect(r.anomalyReason).toContain('저가');
  });
  it('88원 대량도 이상치 (필굿로고 케이스)', () => {
    const r = detectAnomaly(mm([['2026-06', 50000]]), 88);
    expect(r.anomalyMonths).toEqual(['2026-06']);
  });
  it('정상 가격 단일월 급증(나머지 합의 4배↑)은 이상치', () => {
    // 30000 vs 나머지 합 5000 → 6배 → 이상치
    const r = detectAnomaly(mm([['2026-04', 1000], ['2026-05', 4000], ['2026-06', 30000]]), 1000);
    expect(r.anomalyMonths).toEqual(['2026-06']);
    expect(r.anomalyReason).toContain('단일월');
  });
  it('시즌 스파이크(나머지 합 대비 4배 미만)는 이상치 아님', () => {
    // 여름 30000, 나머지 합 24000 → 1.25배 → 정상
    const r = detectAnomaly(mm([['2026-05', 12000], ['2026-06', 12000], ['2026-07', 30000]]), 500);
    expect(r.anomalyMonths).toEqual([]);
  });
  it('꾸준한 판매는 이상치 아님', () => {
    const r = detectAnomaly(mm([['2026-05', 12000], ['2026-06', 13000], ['2026-07', 11000]]), 1100);
    expect(r.anomalyMonths).toEqual([]);
  });
  it('저가라도 매달 꾸준히 팔리면 이상치 아님 (빙글빙글프로펠라 케이스)', () => {
    // 65원인데 12개월 고르게 → 집중도 낮음 → 정상
    const r = detectAnomaly(
      mm([
        ['2025-08', 9000], ['2025-09', 11000], ['2025-10', 39640], ['2025-11', 14720],
        ['2025-12', 5200], ['2026-01', 2400], ['2026-02', 12760], ['2026-03', 5800],
        ['2026-04', 18240], ['2026-05', 24120], ['2026-06', 1680], ['2026-07', 2320],
      ]),
      65,
    );
    expect(r.anomalyMonths).toEqual([]);
  });
});

describe('computeTrend', () => {
  it('최근월이 직전 평균보다 20%+ 높으면 up', () => {
    expect(computeTrend([100, 100, 100, 200])).toBe('up');
  });
  it('최근월이 직전 평균보다 20%+ 낮으면 down', () => {
    expect(computeTrend([200, 200, 200, 50])).toBe('down');
  });
  it('밴드 안이면 flat', () => {
    expect(computeTrend([100, 100, 100, 105])).toBe('flat');
  });
  it('직전이 전부 0이고 최근에 팔리면 up', () => {
    expect(computeTrend([0, 0, 30])).toBe('up');
  });
  it('데이터 1개면 flat', () => {
    expect(computeTrend([500])).toBe('flat');
  });
});

describe('computeDeadStock', () => {
  it('재고>0 인데 최근 2개월 판매 0이면 재고 정체 악성', () => {
    expect(computeDeadStock([300, 200, 0, 0], 50)).toEqual({
      deadStock: true,
      deadStockReason: '재고 정체(2개월+ 미판매)',
    });
  });
  it('재고 미상(1단계)에선 정체를 품절과 구분 못해 보류', () => {
    expect(computeDeadStock([300, 200, 0, 0], null).deadStock).toBe(false);
  });
  it('품절(재고 0)은 악성 아님', () => {
    expect(computeDeadStock([300, 200, 0, 0], 0).deadStock).toBe(false);
  });
  it('급감(3개월 연속 감소 + 최근월 ≤ 최대치 30%)은 재고 미상에서도 표시', () => {
    expect(computeDeadStock([1000, 400, 100], null).deadStock).toBe(true);
    expect(computeDeadStock([1000, 400, 100], null).deadStockReason).toBe('판매 급감');
  });
  it('정상 판매는 악성 아님', () => {
    expect(computeDeadStock([100, 120, 130, 150], 500)).toEqual({
      deadStock: false,
      deadStockReason: null,
    });
  });
  it('처음부터 계속 0(신상/무판매)은 악성 아님', () => {
    expect(computeDeadStock([0, 0, 0, 0], 100).deadStock).toBe(false);
  });
});

describe('computeSeasonTag', () => {
  const yr = (m: string, q: number) => ({ yearMonth: m, orderQty: q });
  it('완결 월 8개월 미만이면 판단 보류(null)', () => {
    expect(computeSeasonTag([yr('2026-06', 100), yr('2026-07', 100)], 2)).toBeNull();
  });
  it('여름(6~8월) 집중이 50%+ 면 여름 태그', () => {
    const monthly = [
      yr('2025-09', 5), yr('2025-10', 5), yr('2025-11', 5), yr('2025-12', 5),
      yr('2026-01', 5), yr('2026-02', 5), yr('2026-03', 10), yr('2026-04', 10),
      yr('2026-05', 10), yr('2026-06', 120), yr('2026-07', 120), yr('2026-08', 120),
    ];
    expect(computeSeasonTag(monthly, 12)).toBe('여름');
  });
  it('고른 분포는 상시', () => {
    const monthly = Array.from({ length: 12 }, (_, i) => yr(`2026-${String(i + 1).padStart(2, '0')}`, 100));
    expect(computeSeasonTag(monthly, 12)).toBe('상시');
  });
});

describe('computeReorder', () => {
  it('현재고 미수집(null)이면 계산 보류', () => {
    expect(computeReorder(null, 400)).toEqual({
      monthsOfAvailableStockLeft: null,
      reorderPoint: null,
      needsReorder: false,
    });
  });
  it('현재고 ≤ 발주점(월평균×1.5)이면 발주 필요', () => {
    // 월평균 400 → 발주점 600. 재고 200 → 발주 필요, 잔여 0.5개월
    const r = computeReorder(200, 400);
    expect(r.reorderPoint).toBe(600);
    expect(r.needsReorder).toBe(true);
    expect(r.monthsOfAvailableStockLeft).toBe(0.5);
  });
  it('재고 충분하면 발주 아님', () => {
    const r = computeReorder(2000, 400);
    expect(r.needsReorder).toBe(false);
    expect(r.monthsOfAvailableStockLeft).toBe(5);
  });
  it('무판매(월평균 0)면 발주 대상 아님, 잔여 개월수 null', () => {
    const r = computeReorder(100, 0);
    expect(r.needsReorder).toBe(false);
    expect(r.monthsOfAvailableStockLeft).toBeNull();
  });
});
