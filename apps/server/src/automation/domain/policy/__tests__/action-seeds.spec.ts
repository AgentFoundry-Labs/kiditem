import { describe, expect, it } from 'vitest';

import { generateActionTaskSeeds } from '../action-seeds';

describe('generateActionTaskSeeds', () => {
  it('keeps daily baseline actions even when no warning thresholds fire', () => {
    const seeds = generateActionTaskSeeds({
      minusProducts: 0,
      lowProfitProducts: 0,
      highAdProducts: 0,
      outOfStockSkus: 0,
      mappingAttentionSkus: 0,
      adRate: 0,
      lowCtrProducts: 0,
      lowReviewProducts: 0,
    });

    expect(seeds.map((seed) => seed.taskKey)).toEqual([
      'h-ad-csv',
      'recalc-grade',
      'analyze-ad-rules',
      'analyze-category',
    ]);
    expect(Object.fromEntries(
      seeds
        .filter((seed) => seed.apiCall)
        .map((seed) => [seed.taskKey, seed.apiCall]),
    )).toEqual({
      'recalc-grade': {
        url: '/api/statistics?type=pareto',
        method: 'GET',
      },
      'analyze-ad-rules': {
        url: '/api/ads/strategy/recommend',
        method: 'GET',
      },
      'analyze-category': {
        url: '/api/statistics?type=categories',
        method: 'GET',
      },
    });
  });

  it('adds urgent finance and ad actions when loss and ad-cost thresholds fire', () => {
    const seeds = generateActionTaskSeeds({
      minusProducts: 2,
      lowProfitProducts: 1,
      highAdProducts: 3,
      outOfStockSkus: 0,
      mappingAttentionSkus: 0,
      adRate: 13.2,
      lowCtrProducts: 0,
      lowReviewProducts: 0,
    });

    expect(seeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskKey: 'h-ad-bid', priority: 'urgent', role: 'ad' }),
        expect.objectContaining({ taskKey: 'h-minus-ad-stop', priority: 'urgent' }),
        expect.objectContaining({ taskKey: 'analyze-deficit', priority: 'urgent' }),
        expect.objectContaining({ taskKey: 'analyze-ad', priority: 'high' }),
      ]),
    );
    expect(seeds.find((seed) => seed.taskKey === 'analyze-deficit')?.apiCall).toEqual({
      url: '/api/profit-loss',
      method: 'GET',
    });
    expect(seeds.find((seed) => seed.taskKey === 'analyze-ad')?.apiCall).toEqual({
      url: '/api/ads?limit=200',
      method: 'GET',
    });
  });

  it('adds read-only Sellpia zero-stock and channel mapping-attention links', () => {
    const seeds = generateActionTaskSeeds({
      minusProducts: 0,
      lowProfitProducts: 0,
      highAdProducts: 0,
      outOfStockSkus: 4,
      mappingAttentionSkus: 2,
      adRate: 0,
      lowCtrProducts: 0,
      lowReviewProducts: 0,
    });

    expect(seeds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskKey: 'h-zero-stock',
        href: '/inventory-hub?tab=attention&view=sellpia-zero',
      }),
      expect.objectContaining({
        taskKey: 'h-mapping-attention',
        href: '/product-hub/matching?status=needs_review',
      }),
    ]));
    expect(seeds.find((seed) => seed.taskKey === 'h-zero-stock')?.apiCall).toBeUndefined();
    expect(seeds.find((seed) => seed.taskKey === 'h-mapping-attention')?.apiCall).toBeUndefined();
    expect(seeds.map((seed) => seed.taskKey)).not.toEqual(
      expect.arrayContaining(['h-reorder', 'analyze-stock']),
    );
  });
});
