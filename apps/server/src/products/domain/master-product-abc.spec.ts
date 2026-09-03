import { describe, expect, it } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
  type ProductAbcFormulaPayload,
} from '@kiditem/shared/product-abc';
import {
  evaluateMasterProductAbc,
  interpolateMasterProductAbcAnchor,
  type MasterProductAbcFormulaReadyFacts,
  type MasterProductAbcFormulaReadyMonthlyFact,
} from './master-product-abc';

const formula = PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD;
const cutoffDate = '2026-07-31';

type MonthOptions = Partial<Omit<MasterProductAbcFormulaReadyMonthlyFact, 'provenance'>> & {
  advertisingEvidence?: MasterProductAbcFormulaReadyMonthlyFact['provenance']['advertisingEvidence'];
  costBasis?: MasterProductAbcFormulaReadyMonthlyFact['provenance']['costBasis'];
  vatIncluded?: MasterProductAbcFormulaReadyMonthlyFact['provenance']['vatIncluded'];
};

function month(options: MonthOptions = {}): MasterProductAbcFormulaReadyMonthlyFact {
  const yearMonth = options.yearMonth ?? '2026-07';
  const days = daysInMonth(yearMonth);
  return {
    yearMonth,
    coverageStartDate: options.coverageStartDate ?? `${yearMonth}-01`,
    coverageEndDate: options.coverageEndDate ?? `${yearMonth}-${String(days).padStart(2, '0')}`,
    coveredDays: options.coveredDays ?? days,
    recognizedRevenue: options.recognizedRevenue ?? 1_000_000,
    orderTimeSupplyCost: options.orderTimeSupplyCost ?? 100_000,
    advertisingSpend: options.advertisingSpend === undefined ? 0 : options.advertisingSpend,
    provenance: {
      costBasis: options.costBasis ?? 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: options.vatIncluded ?? true,
      advertisingEvidence: options.advertisingEvidence ?? 'CONFIRMED_ZERO',
    },
  };
}

function facts(
  monthlyFacts: readonly MasterProductAbcFormulaReadyMonthlyFact[] = [month()],
  overrides: Partial<MasterProductAbcFormulaReadyFacts> = {},
): MasterProductAbcFormulaReadyFacts {
  return {
    masterProductId: 'product-1',
    cutoffDate,
    monthlyFacts,
    ...overrides,
  };
}

function evaluate(
  monthlyFacts: readonly MasterProductAbcFormulaReadyMonthlyFact[] = [month()],
  inputFormula: ProductAbcFormulaPayload = formula,
  inputFacts: Partial<MasterProductAbcFormulaReadyFacts> = {},
) {
  return evaluateMasterProductAbc({
    facts: facts(monthlyFacts, inputFacts),
    formula: inputFormula,
  });
}

function daysInMonth(yearMonth: string): number {
  const [year, monthNumber] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
}

function anchoredFormula(overrides: {
  anchors?: Partial<ProductAbcFormulaPayload['anchors']>;
  weights?: Partial<ProductAbcFormulaPayload['weights']>;
} = {}): ProductAbcFormulaPayload {
  return {
    ...formula,
    ...overrides,
    anchors: { ...formula.anchors, ...overrides.anchors },
    weights: { ...formula.weights, ...overrides.weights },
  };
}

describe('PRODUCT_ABC_ABSOLUTE V1 evaluator', () => {
  it('uses the shared canonical payload and returns one product candidate only', () => {
    const candidate = evaluate();

    expect(candidate).toMatchObject({
      masterProductId: 'product-1',
      abcGrade: 'A',
      gradeBasisCutoffDate: cutoffDate,
      validObservationDays: 31,
    });
    expect(candidate).not.toHaveProperty('formula');
    expect(candidate).not.toHaveProperty('calculationStatus');
    expect(candidate).not.toHaveProperty('sourceFreshness');
    expect(candidate).not.toHaveProperty('reliability');
  });

  it('computes operating profit from the three formula components', () => {
    const candidate = evaluate([month({
      recognizedRevenue: 1_000_000,
      orderTimeSupplyCost: 250_000,
      advertisingSpend: 125_000,
      advertisingEvidence: 'OBSERVED',
    })]);

    expect(candidate.weightedOperatingProfit).toBeGreaterThan(0);
    expect(candidate.operatingMargin).toBeCloseTo(0.625, 6);
    expect(candidate.weightedOperatingProfit).toBeCloseTo(
      candidate.weightedRevenue
        - candidate.weightedOrderTimeSupplyCost
        - candidate.weightedAdvertisingSpend,
      5,
    );
  });

  it('matches the 90-day half-life golden weight at an exact midpoint', () => {
    const candidate = evaluate([month({
      coverageStartDate: '2026-07-01',
      coverageEndDate: '2026-07-31',
      coveredDays: 31,
    })]);
    const weight = 2 ** (-15 / formula.halfLifeDays);
    const expectedRevenue = 1_000_000 * weight;
    const expectedProfit = 900_000 * weight;

    expect(candidate.weightedRevenue).toBeCloseTo(expectedRevenue, 6);
    expect(candidate.weightedOperatingProfit).toBeCloseTo(expectedProfit, 6);
    expect(candidate.operatingProfitVelocity30).toBeCloseTo(
      expectedProfit / (31 * weight) * formula.velocityPeriodDays,
      6,
    );
  });

  it('uses every anchor endpoint, linear segment, and endpoint clamp', () => {
    const base = formula.anchors;
    const custom = anchoredFormula({
      anchors: {
        profitVelocity30: base.profitVelocity30.map((anchor) => ({ ...anchor })),
        operatingMargin: base.operatingMargin.map((anchor) => ({ ...anchor })),
        lossPersistence: base.lossPersistence.map((anchor) => ({ ...anchor })),
      },
    });

    for (const anchors of Object.values(custom.anchors)) {
      for (let index = 0; index < anchors.length; index += 1) {
        expect(interpolateMasterProductAbcAnchor(anchors[index]!.value, anchors))
          .toBe(anchors[index]!.score);
        if (index === 0) continue;
        const lower = anchors[index - 1]!;
        const upper = anchors[index]!;
        const midpoint = (lower.value + upper.value) / 2;
        expect(interpolateMasterProductAbcAnchor(midpoint, anchors))
          .toBeCloseTo((lower.score + upper.score) / 2, 10);
      }
      expect(interpolateMasterProductAbcAnchor(anchors[0]!.value - 1, anchors))
        .toBe(anchors[0]!.score);
      expect(interpolateMasterProductAbcAnchor(anchors.at(-1)!.value + 1, anchors))
        .toBe(anchors.at(-1)!.score);
    }

    const atZero = evaluate([month({ recognizedRevenue: 0, orderTimeSupplyCost: 0 })], custom);
    expect(atZero.profitScore).toBe(custom.anchors.profitVelocity30[0]!.score);
    expect(atZero.operatingMargin).toBeNull();
    expect(atZero.marginScore).toBeNull();
    expect(atZero.consistencyScore).toBe(custom.anchors.lossPersistence[0]!.score);

    const betweenProfitAnchors = custom.anchors.profitVelocity30[1]!;
    const upperProfit = custom.anchors.profitVelocity30[2]!;
    const targetVelocity = (betweenProfitAnchors.value + upperProfit.value) / 2;
    const revenue = targetVelocity * 31 / 30;
    const interpolated = evaluate([month({
      recognizedRevenue: revenue,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'OBSERVED',
    })], custom);
    const expectedProfitScore = (betweenProfitAnchors.score + upperProfit.score) / 2;
    expect(interpolated.profitScore).toBeCloseTo(expectedProfitScore, 6);

    const clampedHigh = evaluate([month({
      recognizedRevenue: 100_000_000,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'OBSERVED',
    })], custom);
    expect(clampedHigh.profitScore).toBe(custom.anchors.profitVelocity30.at(-1)!.score);
    expect(clampedHigh.marginScore).toBe(custom.anchors.operatingMargin.at(-1)!.score);
    expect(clampedHigh.consistencyScore).toBe(custom.anchors.lossPersistence[0]!.score);
  });

  it('uses the configured velocity period and only the three exact Hard C rules', () => {
    const custom = { ...formula, velocityPeriodDays: 60 };
    const candidate = evaluate([month()], custom);
    expect(candidate.operatingProfitVelocity30).toBeCloseTo(
      (month().recognizedRevenue - month().orderTimeSupplyCost - month().advertisingSpend!)
        / month().coveredDays * custom.velocityPeriodDays,
      6,
    );

    const zeroRevenue = evaluate([month({ recognizedRevenue: 0, orderTimeSupplyCost: 0 })]);
    expect(zeroRevenue.abcGrade).toBe('C');
    expect(zeroRevenue.marginScore).toBeNull();
    expect(evaluate([month({ recognizedRevenue: 100, orderTimeSupplyCost: 100 })]).abcGrade).toBe('C');
    expect(evaluate([month({ recognizedRevenue: 100, orderTimeSupplyCost: 0, coveredDays: 10 }), month({ yearMonth: '2026-06', recognizedRevenue: 0, orderTimeSupplyCost: 1, coveredDays: 30 })]).abcGrade).toBe('C');
  });

  it('requires confirmed-zero advertising to be literal zero', () => {
    expect(() => evaluate([month({ advertisingSpend: null, advertisingEvidence: 'CONFIRMED_ZERO' })])).toThrow('confirmed-zero');
    expect(evaluate([month({ advertisingSpend: null, advertisingEvidence: 'NOT_APPLIED' })]).abcGrade).toBe('A');
  });

  it('excludes the current KST month and uses the exact latest 12-month calendar window', () => {
    const old = month({ yearMonth: '2025-06', recognizedRevenue: 1, orderTimeSupplyCost: 0 });
    const firstInWindow = month({ yearMonth: '2025-08', recognizedRevenue: 100, orderTimeSupplyCost: 0, advertisingEvidence: 'OBSERVED' });
    const latest = month({ yearMonth: '2026-07', recognizedRevenue: 200, orderTimeSupplyCost: 0, advertisingEvidence: 'OBSERVED' });
    const current = month({ yearMonth: '2026-08', coverageStartDate: '2026-08-01', coverageEndDate: '2026-08-31', recognizedRevenue: Number.NaN });
    const candidate = evaluate([old, firstInWindow, latest, current]);

    expect(candidate.validObservationDays).toBe(31 + 31);
    expect(candidate.weightedRevenue).toBeGreaterThan(0);
    expect(candidate.weightedRevenue).toBeLessThan(301);
    expect(candidate.gradeBasisCutoffDate).toBe('2026-07-31');
  });

  it('keeps gaps missing, uses partial covered days, and weights the exact coverage midpoint', () => {
    const partial = month({
      yearMonth: '2026-06',
      coverageStartDate: '2026-06-10',
      coverageEndDate: '2026-06-20',
      coveredDays: 5,
      recognizedRevenue: 500,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'OBSERVED',
    });
    const latest = month({
      yearMonth: '2026-07',
      coverageStartDate: '2026-07-20',
      coverageEndDate: '2026-07-31',
      coveredDays: 12,
      recognizedRevenue: 1_000,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'OBSERVED',
    });
    const confirmedZero = month({
      yearMonth: '2026-05',
      recognizedRevenue: 0,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'CONFIRMED_ZERO',
    });
    const candidate = evaluate([confirmedZero, partial, latest]);
    const mayMidpointAge = 76;
    const mayWeight = 2 ** (-mayMidpointAge / formula.halfLifeDays);
    const juneMidpointAge = 46;
    const julyMidpointAge = 5.5;
    const juneWeight = 2 ** (-juneMidpointAge / formula.halfLifeDays);
    const julyWeight = 2 ** (-julyMidpointAge / formula.halfLifeDays);
    expect(candidate.validObservationDays).toBe(48);
    expect(candidate.weightedRevenue).toBeCloseTo(500 * juneWeight + 1_000 * julyWeight, 6);
    expect(candidate.operatingProfitVelocity30).toBeCloseTo(
      (500 * juneWeight + 1_000 * julyWeight)
        / (31 * mayWeight + 5 * juneWeight + 12 * julyWeight) * 30,
      6,
    );
  });

  it('accepts a complete confirmed-zero advertising month as zero spend', () => {
    const candidate = evaluate([month({
      recognizedRevenue: 10_000,
      orderTimeSupplyCost: 2_000,
      advertisingSpend: 0,
      advertisingEvidence: 'CONFIRMED_ZERO',
    })]);
    expect(candidate.weightedAdvertisingSpend).toBe(0);
    expect(candidate.weightedOperatingProfit).toBeGreaterThan(0);
  });

  it('applies each Hard C rule before threshold assignment', () => {
    const zeroProfit = evaluate([month({ recognizedRevenue: 100_000, orderTimeSupplyCost: 100_000 })]);
    expect(zeroProfit.abcGrade).toBe('C');

    const negativeProfit = evaluate([month({ recognizedRevenue: 100_000, orderTimeSupplyCost: 100_001 })]);
    expect(negativeProfit.abcGrade).toBe('C');

    const lossPersistence = evaluate([
      month({ yearMonth: '2026-06', recognizedRevenue: 0, orderTimeSupplyCost: 100, coveredDays: 20, advertisingEvidence: 'OBSERVED' }),
      month({ yearMonth: '2026-07', recognizedRevenue: 100, orderTimeSupplyCost: 0, coveredDays: 11, advertisingEvidence: 'OBSERVED' }),
    ]);
    expect(lossPersistence.lossPersistence).toBeGreaterThanOrEqual(formula.hardC.lossPersistenceGte);
    expect(lossPersistence.abcGrade).toBe('C');
  });

  it('keeps a zero-revenue non-positive result nullable and rejects positive profit with zero revenue', () => {
    const zeroRevenue = evaluate([month({ recognizedRevenue: 0, orderTimeSupplyCost: 0 })]);
    expect(zeroRevenue).toMatchObject({
      abcGrade: 'C',
      weightedRevenue: 0,
      operatingMargin: null,
      marginScore: null,
    });
    expect(() => evaluate([month({ recognizedRevenue: 0, orderTimeSupplyCost: -1, advertisingSpend: 0 })])).toThrow('positive operating profit');
  });

  it('uses unrounded thresholds and the two A guards', () => {
    const allHigh = evaluate([month({ recognizedRevenue: 10_000_000, orderTimeSupplyCost: 0, advertisingSpend: 0, advertisingEvidence: 'OBSERVED' })]);
    expect(allHigh.abcGrade).toBe('A');

    const marginGuard = evaluate([month({ recognizedRevenue: 20_000_000, orderTimeSupplyCost: 17_500_000, advertisingSpend: 0, advertisingEvidence: 'OBSERVED' })]);
    expect(marginGuard.economicScore).toBeGreaterThanOrEqual(formula.gradeThresholds.aEconomicScoreGte);
    expect(marginGuard.marginScore).toBeLessThan(formula.gradeThresholds.aMarginScoreGte);
    expect(marginGuard.abcGrade).toBe('B');

    const consistencyGuard = evaluate([
      month({ yearMonth: '2026-06', recognizedRevenue: 0, orderTimeSupplyCost: 1, coveredDays: 15, advertisingEvidence: 'OBSERVED' }),
      month({ yearMonth: '2026-07', recognizedRevenue: 10_000_000, orderTimeSupplyCost: 0, coveredDays: 15, advertisingEvidence: 'OBSERVED' }),
    ]);
    expect(consistencyGuard.consistencyScore).toBeLessThan(formula.gradeThresholds.aConsistencyScoreGte);
    expect(consistencyGuard.abcGrade).toBe('B');

    const bFormula = anchoredFormula({
      anchors: {
        profitVelocity30: formula.anchors.profitVelocity30.map((anchor) => ({ ...anchor, score: 60 })),
        operatingMargin: formula.anchors.operatingMargin.map((anchor) => ({ ...anchor, score: 0 })),
        lossPersistence: formula.anchors.lossPersistence.map((anchor) => ({ ...anchor, score: 100 })),
      },
    });
    const bBoundary = evaluate([month({ recognizedRevenue: 1_000_000, orderTimeSupplyCost: 0, advertisingSpend: 0, advertisingEvidence: 'OBSERVED' })], bFormula);
    expect(bBoundary.economicScore).toBeGreaterThanOrEqual(formula.gradeThresholds.bEconomicScoreGte);
    expect(bBoundary.abcGrade).toBe('B');
  });

  it('uses the persistence table directly rather than inverting it twice', () => {
    const candidate = evaluate([
      month({ yearMonth: '2026-06', recognizedRevenue: 0, orderTimeSupplyCost: 100, coveredDays: 15, advertisingEvidence: 'OBSERVED' }),
      month({ yearMonth: '2026-07', recognizedRevenue: 100, orderTimeSupplyCost: 0, coveredDays: 15, advertisingEvidence: 'OBSERVED' }),
    ]);
    expect(candidate.lossPersistence).toBeGreaterThan(0);
    expect(candidate.lossPersistence).toBeLessThan(0.5);
    expect(candidate.consistencyScore).toBeLessThan(formula.anchors.lossPersistence[0]!.score);
    expect(candidate.consistencyScore).toBeGreaterThan(formula.anchors.lossPersistence.at(-1)!.score);
  });

  it('rounds persisted metrics half-up while grading on unrounded values', () => {
    const crossingFormula = anchoredFormula({
      anchors: {
        profitVelocity30: formula.anchors.profitVelocity30.map((anchor) => ({ ...anchor, score: 83.9999994 })),
        operatingMargin: formula.anchors.operatingMargin.map((anchor) => ({ ...anchor, score: 60 })),
        lossPersistence: formula.anchors.lossPersistence.map((anchor) => ({ ...anchor, score: 100 })),
      },
    });
    const candidate = evaluate([month({
      recognizedRevenue: 1_000_000,
      orderTimeSupplyCost: 0,
      advertisingSpend: 0,
      advertisingEvidence: 'OBSERVED',
    })], crossingFormula);

    expect(candidate.operatingMargin).toBe(1);
    expect(Number.isInteger(candidate.economicScore * 1_000_000)).toBe(true);
    expect(candidate.economicScore).toBe(80);
    expect(candidate.abcGrade).toBe('B');
  });

  it('rejects missing or ineligible provenance instead of manufacturing a candidate', () => {
    expect(() => evaluate([month({ costBasis: 'LEGACY' as never })])).toThrow('ineligible cost provenance');
    expect(() => evaluate([month({ vatIncluded: false as never })])).toThrow('VAT inclusion');
    expect(() => evaluate([month({ advertisingEvidence: 'MISSING' as never })])).toThrow('ineligible advertising evidence');
    expect(() => evaluate([month({ advertisingSpend: 10, advertisingEvidence: 'NOT_APPLIED' })])).toThrow('not applied');
    const missingProvenance = { ...month(), provenance: undefined } as never;
    expect(() => evaluate([missingProvenance])).toThrow('ineligible cost provenance');
  });

  it('is deterministic and independent for unrelated product identities', () => {
    const left = evaluate([month()], formula, { masterProductId: 'product-a' });
    const right = evaluate([month()], formula, { masterProductId: 'product-b' });
    expect({ ...left, masterProductId: undefined }).toEqual({ ...right, masterProductId: undefined });
  });
});
