import { describe, expect, it } from 'vitest';
import {
  buildQuantileKnots,
  normalizeWithKnots,
} from './master-product-profitability-score';

describe('automatic profitability score regressions', () => {
  // Regression: ISSUE-001 — equal margins received different ABC scores from floating-point noise.
  // Found by /qa on 2026-08-02
  // Report: .gstack/qa-reports/qa-report-abc-profitability-2026-08-02.md
  it('collapses mathematically equal ratios before fitting and applying normalization knots', () => {
    const equivalentMargins = [
      0.7999999999999999,
      0.8,
      0.8000000000000002,
    ];

    const knots = buildQuantileKnots(equivalentMargins);

    expect(knots).toHaveLength(1);
    expect(knots[0]).toEqual({ value: expect.closeTo(0.8), score: 50 });
    expect(equivalentMargins.map((margin) => normalizeWithKnots(margin, knots)))
      .toEqual([50, 50, 50]);
  });
});
