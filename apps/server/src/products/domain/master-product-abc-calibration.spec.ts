import { describe, expect, it } from 'vitest';
import {
  calibrateProductAbcFormula,
  PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
  productAbcCandidateGrid,
} from './master-product-abc-calibration';

function examples() {
  const originMonths = ['2026-01', '2026-02', '2026-03', '2026-04'];
  return originMonths.flatMap((originMonth, originIndex) =>
    Array.from({ length: 10 }, (_, productIndex) => {
      const level = productIndex + 1;
      const start = new Date(`${originMonth}-01T00:00:00.000Z`);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      return {
        masterProductId: `product-${productIndex}`,
        originMonth,
        asOfDate: end,
        facts: [{
          coverageStartDate: start,
          coverageEndDate: end,
          coveredDays: end.getUTCDate(),
          revenue: level * 100,
          orderTimeCogs: level * 20,
          adSpend: 0,
          contributionProfit: level * 80,
          negativeCoveredDays: 0,
        }],
        paidOrderCount: 20 + originIndex,
        observationDays: 40 + originIndex,
        nextMonthProfitVelocity: level * 10,
      };
    }));
}

const candidates = [{
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  orderShrinkK: 20,
  dayShrinkK: 30,
}] as const;

describe('Product ABC deterministic calibration', () => {
  it('refuses calibration below the evidence or rolling-origin minimum', () => {
    expect(calibrateProductAbcFormula({
      examples: examples().slice(0, 29), version: 1, activatedAt: new Date('2026-08-01T00:00:00.000Z'), candidates,
    })).toBeNull();
    expect(calibrateProductAbcFormula({
      examples: examples().filter((example) => example.originMonth === '2026-01' || example.originMonth === '2026-02'), version: 1,
      activatedAt: new Date('2026-08-01T00:00:00.000Z'), candidates,
    })).toBeNull();
  });

  it('fits frozen knots and tie-safe ordered cutoffs from training-only rolling origins', () => {
    const result = calibrateProductAbcFormula({
      examples: examples(), version: 1, activatedAt: new Date('2026-08-01T00:00:00.000Z'), candidates,
    });
    expect(result).not.toBeNull();
    expect(result!.formula).toMatchObject({
      formulaKey: 'ABC_V1',
      version: 1,
      calculationCodeChecksum: PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
      sampleCount: 40,
      foldCount: 3,
    });
    expect(result!.formula.cutoffs.bToA).toBeGreaterThan(result!.formula.cutoffs.cToB);
  });

  it('is stable for shuffled inputs and keeps the formula unchanged when the portfolio changes later', () => {
    const input = { version: 1, activatedAt: new Date('2026-08-01T00:00:00.000Z'), candidates };
    const first = calibrateProductAbcFormula({ ...input, examples: examples() });
    const second = calibrateProductAbcFormula({ ...input, examples: [...examples()].reverse() });
    expect(first?.formula.formulaChecksum).toBe(second?.formula.formulaChecksum);
    expect(first?.formula.normalizationKnots).toEqual(second?.formula.normalizationKnots);
  });

  it('uses exact integer-tick candidate weights that always sum to one', () => {
    const grid = productAbcCandidateGrid();
    expect(grid).not.toHaveLength(0);
    expect(grid.every((candidate) =>
      Math.abs(candidate.weights.profit + candidate.weights.margin + candidate.weights.persistence - 1) < Number.EPSILON
      && candidate.weights.profit >= candidate.weights.margin
      && candidate.weights.profit >= candidate.weights.persistence)).toBe(true);
  });
});
