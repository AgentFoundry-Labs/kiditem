import { describe, expect, it } from 'vitest';
import { parseActionResult } from './actions';
import { getActionTaskRole } from './action-board-columns';

describe('action board inventory semantics', () => {
  it('does not interpret retired analyze-stock results as reorder advice', () => {
    const result = parseActionResult('analyze-stock', {
      inventories: [
        {
          productName: '레거시 상품',
          currentStock: 1,
          reorderPoint: 5,
          avgDailySales: 2,
        },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ label: '결과' }),
    ]);
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '발주 필요' }),
      ]),
    );
  });

  it('renders the current Pareto statistics response for grade analysis', () => {
    const result = parseActionResult('recalc-grade', {
      totalRevenue: 120000,
      gradeDistribution: { A: 1, B: 1, C: 0 },
      mismatchCount: 1,
      data: [
        { name: '상품 A', currentGrade: 'B', suggestedGrade: 'A', gradeMatch: false },
        { name: '상품 B', currentGrade: 'B', suggestedGrade: 'B', gradeMatch: true },
      ],
    });

    expect(result).toEqual(expect.arrayContaining([
      { label: '총 상품', value: '2개' },
      { label: '등급 변경 제안', value: '1개', highlight: true },
      { label: 'A등급', value: '1개' },
    ]));
  });

  it('renders the current profit-loss array for deficit analysis', () => {
    const result = parseActionResult('analyze-deficit', [
      {
        masterName: '적자 상품',
        profitRate: -5.4,
        revenue: 10000,
        cogs: 7000,
        adCost: 4000,
      },
      { masterName: '흑자 상품', profitRate: 12, revenue: 10000, cogs: 5000, adCost: 500 },
    ]);

    expect(result).toEqual(expect.arrayContaining([
      { label: '적자 상품 수', value: '1개', highlight: true },
      expect.objectContaining({ label: '적자 상품', value: expect.stringContaining('이익률') }),
    ]));
  });

  it('renders the current advertising list response', () => {
    const result = parseActionResult('analyze-ad', {
      items: [
        { masterProduct: { name: '중단 상품' }, metrics: { roas: 80 }, adTier: '1차' },
        { masterProduct: { name: '유지 상품' }, metrics: { roas: 420 }, adTier: '1차' },
      ],
    });

    expect(result).toEqual(expect.arrayContaining([
      { label: '광고 중단 권장', value: '1개 (ROAS < 100%)', highlight: true },
      { label: '광고 유지/확대', value: '1개 (ROAS 300%+)' },
    ]));
  });

  it('renders current advertising CTR metrics', () => {
    const result = parseActionResult('analyze-ctr', {
      items: [
        { masterProduct: { name: '개선 상품' }, metrics: { ctr: 1.2 } },
        { masterProduct: { name: '정상 상품' }, metrics: { ctr: 2.1 } },
      ],
    });

    expect(result).toEqual(expect.arrayContaining([
      { label: 'CTR 미달 상품', value: '1개', highlight: true },
      { label: '개선 상품', value: 'CTR 1.2% → 목표 1.5% 이상' },
    ]));
  });

  it('renders current strategy recommendation and category arrays', () => {
    const recommendations = parseActionResult('analyze-ad-rules', [
      { priority: 'urgent', title: '광고 중단', action: '캠페인 중단' },
      { priority: 'high', title: '예산 축소', action: '예산 20% 축소' },
    ]);
    const categories = parseActionResult('analyze-category', [
      { category: '완구', revenue: 100000, profit: 20000, count: 3 },
    ]);

    expect(recommendations).toEqual(expect.arrayContaining([
      { label: '분석 상품 수', value: '2개' },
      { label: '긴급 조치 필요', value: '1개', highlight: true },
    ]));
    expect(categories).toEqual(expect.arrayContaining([
      { label: '카테고리 수', value: '1개' },
      { label: '완구', value: '매출 100,000원 | 이익률 20% | 상품 3개' },
    ]));
  });

  it('routes factual zero-stock and mapping-attention tasks to inventory', () => {
    expect(getActionTaskRole('h-zero-stock')).toBe('inventory');
    expect(getActionTaskRole('h-mapping-attention')).toBe('inventory');
  });
});
