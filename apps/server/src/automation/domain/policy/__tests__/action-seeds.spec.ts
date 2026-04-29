import { describe, expect, it } from 'vitest';

import { generateActionTaskSeeds } from '../action-seeds';

describe('generateActionTaskSeeds', () => {
  it('keeps daily baseline actions even when no warning thresholds fire', () => {
    const seeds = generateActionTaskSeeds({
      minusProducts: 0,
      lowProfitProducts: 0,
      highAdProducts: 0,
      needReorder: 0,
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
  });

  it('adds urgent finance and ad actions when loss and ad-cost thresholds fire', () => {
    const seeds = generateActionTaskSeeds({
      minusProducts: 2,
      lowProfitProducts: 1,
      highAdProducts: 3,
      needReorder: 0,
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
  });
});
