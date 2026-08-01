import { describe, expect, it } from 'vitest';
import {
  buildQuantileKnots,
  calculateProfitabilityScore,
  calculateReliability,
  calculateWeightedProfitabilityMetrics,
  canonicalJson,
  normalizeWithKnots,
  sha256CanonicalJson,
} from './master-product-profitability-score';

const AS_OF = new Date('2026-07-31T00:00:00.000Z');
const formula = {
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  orderShrinkK: 20,
  dayShrinkK: 30,
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: -1, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
} as const;

function fact(overrides: Partial<{
  coverageStartDate: Date; coverageEndDate: Date; coveredDays: number; revenue: number;
  orderTimeCogs: number; adSpend: number; contributionProfit: number; negativeCoveredDays: number;
}> = {}) {
  return {
    coverageStartDate: new Date('2026-07-01T00:00:00.000Z'),
    coverageEndDate: new Date('2026-07-10T00:00:00.000Z'),
    coveredDays: 10,
    revenue: 1_000,
    orderTimeCogs: 400,
    adSpend: 100,
    contributionProfit: 500,
    negativeCoveredDays: 0,
    ...overrides,
  };
}

describe('automatic profitability score', () => {
  it('uses coverage midpoints, a continuous half-life, and actual covered days', () => {
    const metrics = calculateWeightedProfitabilityMetrics({
      facts: [fact({ coverageStartDate: new Date('2026-07-21T00:00:00.000Z'), coverageEndDate: new Date('2026-07-30T00:00:00.000Z') })],
      asOfDate: AS_OF,
      halfLifeDays: 10,
    });
    const expectedWeight = 2 ** (-5.5 / 10);
    expect(metrics.coveredDays).toBeCloseTo(10 * expectedWeight);
    expect(metrics.profitVelocity30).toBeCloseTo(1_500);
    expect(metrics.contributionMargin).toBeCloseTo(0.5);
  });

  it('keeps zero-revenue loss margin null and rejects impossible positive profit', () => {
    expect(calculateWeightedProfitabilityMetrics({
      facts: [fact({ revenue: 0, contributionProfit: -10 })], asOfDate: AS_OF, halfLifeDays: 90,
    }).contributionMargin).toBeNull();
    expect(() => calculateWeightedProfitabilityMetrics({
      facts: [fact({ revenue: 0, contributionProfit: 10 })], asOfDate: AS_OF, halfLifeDays: 90,
    })).toThrow('impossible');
  });

  it('clamps, interpolates, and collapses duplicate quantile knots deterministically', () => {
    expect(normalizeWithKnots(-1, [{ value: 0, score: 10 }, { value: 10, score: 90 }])).toBe(10);
    expect(normalizeWithKnots(5, [{ value: 0, score: 10 }, { value: 10, score: 90 }])).toBe(50);
    const knots = buildQuantileKnots([1, 1, 1, 1]);
    expect(knots).toEqual([{ value: 1, score: 50 }]);
  });

  it('is monotonic for contribution and margin, inverse for loss, and shrinks with evidence', () => {
    const base = calculateProfitabilityScore({ facts: [fact()], asOfDate: AS_OF, formula, paidOrderCount: 20, observationDays: 30 });
    const betterProfit = calculateProfitabilityScore({ facts: [fact({ contributionProfit: 600 })], asOfDate: AS_OF, formula, paidOrderCount: 20, observationDays: 30 });
    const worseLoss = calculateProfitabilityScore({ facts: [fact({ negativeCoveredDays: 10 })], asOfDate: AS_OF, formula, paidOrderCount: 20, observationDays: 30 });
    expect(betterProfit.rawScore).toBeGreaterThanOrEqual(base.rawScore!);
    expect(worseLoss.rawScore).toBeLessThanOrEqual(base.rawScore!);
    expect(calculateReliability({ paidOrderCount: 20, observationDays: 30, orderShrinkK: 20, dayShrinkK: 30 })).toBeGreaterThan(0);
    expect(calculateReliability({ paidOrderCount: 1_000_000, observationDays: 1_000_000, orderShrinkK: 20, dayShrinkK: 30 })).toBeLessThan(1);
  });

  it('uses stable canonical checksums independent of object field order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(sha256CanonicalJson({ b: 1, a: 2 })).toBe(sha256CanonicalJson({ a: 2, b: 1 }));
  });
});
