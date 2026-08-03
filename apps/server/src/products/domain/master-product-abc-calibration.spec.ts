import { describe, expect, it } from 'vitest';
import {
  createFixedProductAbcFormula,
  PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
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
        observationDays: 40 + originIndex,
        nextMonthProfitVelocity: level * 10,
      };
    }));
}

describe('Product ABC fixed quantile formula', () => {
  it('refuses to create a formula without three usable profitability observations', () => {
    expect(createFixedProductAbcFormula({
      observations: examples().slice(0, 2),
      version: 1,
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
    })).toBeNull();
  });

  it('creates a stable fixed-weight formula from the available Sellpia history', () => {
    const result = createFixedProductAbcFormula({
      observations: examples(), version: 1, activatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(result).not.toBeNull();
    expect(result!.formula).toMatchObject({
      formulaKey: 'ABC_V1',
      version: 1,
      calculationCodeChecksum: PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
      sampleCount: 40,
      foldCount: 0,
      calibrationMethod: 'FIXED_QUANTILE',
      halfLifeDays: 90,
      weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
      dayShrinkK: 30,
      cutoffs: { cToB: 30, bToA: 80 },
    });
  });

  it('is stable for shuffled observations', () => {
    const input = { version: 1, activatedAt: new Date('2026-08-01T00:00:00.000Z') };
    const first = createFixedProductAbcFormula({ ...input, observations: examples() });
    const second = createFixedProductAbcFormula({ ...input, observations: [...examples()].reverse() });
    expect(first?.formula.formulaChecksum).toBe(second?.formula.formulaChecksum);
    expect(first?.formula.normalizationKnots).toEqual(second?.formula.normalizationKnots);
  });
});
