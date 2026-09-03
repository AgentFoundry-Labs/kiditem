import { describe, expect, it } from 'vitest';

import {
  PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
  PRODUCT_ABC_ABSOLUTE_V1_ANCHORS,
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH,
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_JSON,
  ProductAbcContributionAnalyticsSchema,
  ProductAbcCostComponentSchema,
  ProductAbcDisplayStatusSchema,
  ProductAbcEvaluationSchema,
  ProductAbcFormulaPayloadSchema,
  ProductAbcFormulaStateSchema,
  ProductAbcGradeHistorySchema,
  ProductAbcReadModelSchema,
} from './product-abc.js';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID_2 = '00000000-0000-4000-8000-000000000002';
const ISO = '2026-08-01T00:00:00.000Z';

function evaluation(overrides: Record<string, unknown> = {}) {
  return {
    abcGrade: 'A',
    weightedRevenue: 1_000_000,
    weightedOrderTimeSupplyCost: 100_000,
    weightedAdvertisingSpend: 50_000,
    weightedOperatingProfit: 850_000,
    operatingProfitVelocity30: 825_000,
    operatingMargin: 0.85,
    lossPersistence: 0,
    profitScore: 66,
    marginScore: 100,
    consistencyScore: 100,
    economicScore: 86.5,
    validObservationDays: 31,
    formula: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
    formulaRevision: 1,
    publicationRevision: 1,
    gradeBasisCutoffDate: '2026-07-31',
    sellpiaSourceImportRunId: UUID,
    advertisingSourceImportRunId: UUID_2,
    sellpiaGeneration: '11',
    advertisingGeneration: '7',
    mappingGeneration: '4',
    calculatedAt: ISO,
    ...overrides,
  };
}

describe('absolute product profitability ABC contracts', () => {
  it('locks the canonical V1 payload, anchors, policy hash, and precision', () => {
    expect(ProductAbcFormulaPayloadSchema.parse(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD))
      .toEqual(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.formulaKey).toBe('PRODUCT_ABC_ABSOLUTE');
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.version).toBe(1);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.anchors).toEqual(PRODUCT_ABC_ABSOLUTE_V1_ANCHORS);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.minimumObservationDays).toBe(30);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.velocityPeriodDays).toBe(30);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.maxCompleteMonths).toBe(12);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.excludeCurrentKstMonth).toBe(true);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.hardC).toEqual({
      weightedOperatingProfitLte: 0,
      operatingMarginLte: 0,
      lossPersistenceGte: 0.5,
    });
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.gradeThresholds).toEqual({
      aEconomicScoreGte: 80,
      aMarginScoreGte: 60,
      aConsistencyScoreGte: 60,
      bEconomicScoreGte: 50,
    });
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.precision).toEqual({
      arithmetic: 'IEEE-754_BINARY64',
      persistedScale: 6,
      rounding: 'ROUND_HALF_UP',
      thresholdComparison: 'UNROUNDED',
    });
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.adSourcePolicyHash)
      .toBe(PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH).not.toContain('TODO');
    expect(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_JSON).toContain('PRODUCT_ABC_ABSOLUTE');
  });

  it('does not accept drifted anchors, policy hash, or removed compatibility fields', () => {
    expect(() => ProductAbcFormulaPayloadSchema.parse({
      ...PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
      anchors: {
        ...PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.anchors,
        profitVelocity30: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.anchors.profitVelocity30.map(
          (point, index) => index === 1 ? { ...point, score: 21 } : point,
        ),
      },
    })).toThrow();
    expect(() => ProductAbcFormulaPayloadSchema.parse({
      ...PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
      adSourcePolicyHash: 'a'.repeat(64),
    })).toThrow();
    for (const field of [
      'calculationStatus',
      'rawScore',
      'adjustedScore',
      'reliability',
      'ordersSourceStatus',
      'populationHash',
    ]) {
      expect(ProductAbcFormulaPayloadSchema.safeParse({
        ...PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
        [field]: null,
      }).success).toBe(false);
    }
  });

  it('requires absolute Evaluation provenance and derives five read statuses', () => {
    const parsed = ProductAbcEvaluationSchema.parse(evaluation());
    expect(parsed.abcGrade).toBe('A');
    expect(parsed.sellpiaGeneration).toBe('11');
    expect(parsed.formula.formulaKey).toBe('PRODUCT_ABC_ABSOLUTE');

    expect(ProductAbcDisplayStatusSchema.options).toEqual([
      'SOURCE_UNMAPPED',
      'SELLPIA_SOURCE_STALE',
      'AD_SOURCE_STALE',
      'INSUFFICIENT_EVIDENCE',
      'READY',
    ]);

    const stale = ProductAbcReadModelSchema.parse({
      abcGrade: 'A',
      evaluation: parsed,
      displayStatus: 'AD_SOURCE_STALE',
      recalculationPending: true,
      recalculationRequestedRevision: 4,
      recalculatedRevision: 3,
      gradeBasisCutoffDate: '2026-07-31',
      actualCutoffDate: '2026-08-31',
    });
    expect(stale.evaluation?.abcGrade).toBe('A');
    expect(() => ProductAbcReadModelSchema.parse({
      abcGrade: null,
      evaluation: null,
      displayStatus: 'READY',
      recalculationPending: false,
      recalculationRequestedRevision: 1,
      recalculatedRevision: 1,
      gradeBasisCutoffDate: null,
      actualCutoffDate: '2026-07-31',
    })).toThrow();
    expect(() => ProductAbcEvaluationSchema.parse(evaluation({
      weightedOperatingProfit: -1,
      operatingMargin: null,
    }))).not.toThrow();
    expect(() => ProductAbcEvaluationSchema.parse(evaluation({
      advertisingSourceImportRunId: null,
    }))).toThrow();
    expect(() => ProductAbcEvaluationSchema.parse(evaluation({
      advertisingGeneration: null,
    }))).toThrow();
    expect(() => ProductAbcEvaluationSchema.parse(evaluation({
      sourceFreshness: {},
    }))).toThrow();
    for (const displayStatus of ['SOURCE_UNMAPPED', 'INSUFFICIENT_EVIDENCE'] as const) {
      expect(() => ProductAbcReadModelSchema.parse({
        ...stale,
        displayStatus,
      })).toThrow();
      expect(() => ProductAbcReadModelSchema.parse({
        abcGrade: null,
        evaluation: null,
        displayStatus,
        recalculationPending: false,
        recalculationRequestedRevision: 1,
        recalculatedRevision: 1,
        gradeBasisCutoffDate: null,
        actualCutoffDate: '2026-07-31',
      })).not.toThrow();
    }
  });

  it('keeps zero-cost states unambiguous', () => {
    expect(ProductAbcCostComponentSchema.parse({
      amount: 0,
      status: 'CONFIRMED_ZERO',
    })).toEqual({ amount: 0, status: 'CONFIRMED_ZERO' });
    expect(ProductAbcCostComponentSchema.parse({
      amount: 0,
      status: 'NOT_APPLIED',
    })).toEqual({ amount: 0, status: 'NOT_APPLIED' });
    expect(() => ProductAbcCostComponentSchema.parse({
      amount: null,
      status: 'CONFIRMED_ZERO',
    })).toThrow();
    expect(() => ProductAbcCostComponentSchema.parse({
      amount: 1,
      status: 'CONFIRMED_ZERO',
    })).toThrow();
    expect(() => ProductAbcCostComponentSchema.parse({
      amount: 1,
      status: 'NOT_APPLIED',
    })).toThrow();
  });

  it('keeps current and published formula/mapping revisions in one state contract', () => {
    const state = ProductAbcFormulaStateSchema.parse({
      organizationId: UUID,
      activeFormulaVersionId: UUID_2,
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedSellpiaSourceImportRunId: UUID,
      publishedAdvertisingSourceImportRunId: UUID_2,
      publishedMappingGeneration: '3',
      mappingGeneration: '4',
      recalculationRequestedRevision: 5,
      recalculatedRevision: 4,
    });
    expect(state.mappingGeneration).toBe('4');
    expect(() => ProductAbcFormulaStateSchema.parse({
      ...state,
      recalculatedRevision: 6,
    })).toThrow();
  });

  it('keeps grade history and contribution denominators independent', () => {
    const history = ProductAbcGradeHistorySchema.parse({
      oldGrade: 'B',
      newGrade: 'A',
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      formulaVersion: 1,
      formulaRevision: 2,
      publicationRevision: 3,
      economicScore: 86.5,
      sourceCutoffDate: '2026-07-31',
      previousSellpiaSourceImportRunId: UUID,
      nextSellpiaSourceImportRunId: UUID_2,
      previousAdvertisingSourceImportRunId: null,
      nextAdvertisingSourceImportRunId: UUID_2,
      reason: 'AUTOMATIC_PROFITABILITY_EVALUATION',
      calculatedAt: ISO,
    });
    expect(history.newGrade).toBe('A');

    const metric = {
      amount: 100,
      denominator: 1_000,
      share: 0.1,
      cumulativeShare: 0.1,
      rank: 1,
      status: 'READY',
    } as const;
    const analytics = ProductAbcContributionAnalyticsSchema.parse({
      basisCutoffDate: '2026-07-31',
      rows: [{
        masterProductId: UUID,
        sales: metric,
        operatingProfit: {
          ...metric,
          amount: -100,
          denominator: -1_000,
          share: 0.1,
          cumulativeShare: 0.1,
        },
        lossImpact: { ...metric, amount: 100, share: 1, cumulativeShare: 1 },
      }],
      sales: {
        basisCutoffDate: '2026-07-31',
        sourceCutoffDate: '2026-07-31',
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: 1_000,
        sourceStatusSummary: { sellpia: 'READY', advertising: 'READY', mapping: 'READY' },
      },
      operatingProfit: {
        basisCutoffDate: '2026-07-31',
        sourceCutoffDate: '2026-07-30',
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: -1_000,
        sourceStatusSummary: { sellpia: 'READY', advertising: 'STALE', mapping: 'READY' },
      },
      lossImpact: {
        basisCutoffDate: '2026-07-31',
        sourceCutoffDate: '2026-07-29',
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: 100,
        sourceStatusSummary: { sellpia: 'READY', advertising: 'MISSING', mapping: 'READY' },
      },
    });
    expect(analytics.operatingProfit.rows).toBeUndefined();
    expect(analytics.rows[0]?.operatingProfit.denominator).toBe(-1_000);
    expect(analytics.rows[0]?.operatingProfit.share).toBe(0.1);
    const zeroDenominator = ProductAbcContributionAnalyticsSchema.parse({
      ...analytics,
      rows: [{
        ...analytics.rows[0]!,
        sales: {
          amount: 0,
          denominator: null,
          share: null,
          cumulativeShare: null,
          rank: null,
          status: 'NO_DENOMINATOR',
        },
      }],
      sales: { ...analytics.sales, denominator: null },
    });
    expect(zeroDenominator.sales.includedProductCount).toBe(1);
  });
});
