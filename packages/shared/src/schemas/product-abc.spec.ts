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

function sourceFreshness() {
  return {
    sellpia: {
      status: 'READY',
      sourceImportRunId: UUID,
      generation: '11',
      coverageStartDate: '2026-01-01',
      coverageEndDate: '2026-08-31',
      actualCutoffDate: '2026-08-31',
      capturedAt: ISO,
      latestAttemptState: 'COMPLETE',
      errorCode: null,
    },
    advertising: {
      status: 'STALE',
      sourceImportRunId: UUID_2,
      generation: '7',
      coverageStartDate: '2026-01-01',
      coverageEndDate: '2026-08-31',
      actualCutoffDate: '2026-08-31',
      capturedAt: ISO,
      latestAttemptState: 'FAILED',
      errorCode: 'marketplace_login',
    },
    mapping: { status: 'READY', mappingGeneration: '4' },
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

  it('requires absolute Evaluation provenance and exposes official and live read state', () => {
    const parsed = ProductAbcEvaluationSchema.parse(evaluation());
    expect(parsed.abcGrade).toBe('A');
    expect(parsed.sellpiaGeneration).toBe('11');
    expect(parsed.formula.formulaKey).toBe('PRODUCT_ABC_ABSOLUTE');

    expect(ProductAbcDisplayStatusSchema.options).toEqual([
      'NEW',
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
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-08-31',
      sources: sourceFreshness(),
    });
    expect(stale.evaluation?.abcGrade).toBe('A');
    expect(stale.publicationRevision).toBe(4);
    expect(stale.sources.advertising.capturedAt).toBe(ISO);
    expect(ProductAbcReadModelSchema.safeParse({
      ...stale,
      recalculationPending: false,
    }).success).toBe(false);
    expect(() => ProductAbcReadModelSchema.parse({
      abcGrade: null,
      evaluation: null,
      displayStatus: 'READY',
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-07-31',
      sources: sourceFreshness(),
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
    expect(() => ProductAbcReadModelSchema.parse({
      ...stale,
      displayStatus: 'SOURCE_UNMAPPED',
    })).not.toThrow();
    for (const displayStatus of ['NEW', 'INSUFFICIENT_EVIDENCE'] as const) {
      expect(() => ProductAbcReadModelSchema.parse({
        abcGrade: null,
        evaluation: null,
        displayStatus,
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoffDate: '2026-07-31',
        publishedAt: ISO,
        actualCutoffDate: '2026-07-31',
        sources: sourceFreshness(),
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
      publishedAt: ISO,
    });
    expect(state.mappingGeneration).toBe('4');
    expect(ProductAbcFormulaStateSchema.safeParse({
      ...state,
      recalculationRequestedRevision: 5,
    }).success).toBe(false);
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

    const analytics = ProductAbcContributionAnalyticsSchema.parse({
      basis: {
        fromDate: '2026-07-01',
        cutoffDate: '2026-07-31',
        sourceCutoffDate: '2026-07-31',
        sellpiaSourceImportRunId: UUID,
        advertisingSourceImportRunId: UUID_2,
        sourceStatusSummary: { sellpia: 'READY', advertising: 'READY', mapping: 'READY' },
      },
      totals: {
        revenue: 1_000,
        positiveOperatingProfit: 100,
        lossMagnitude: 20,
        netOperatingProfit: 80,
      },
      metrics: {
        sales: {
          status: 'READY',
          includedProductCount: 2,
          excludedProductCount: 0,
          denominator: 1_000,
        },
        positiveOperatingProfit: {
          status: 'READY',
          includedProductCount: 2,
          excludedProductCount: 0,
          denominator: 100,
        },
        loss: {
          status: 'READY',
          includedProductCount: 2,
          excludedProductCount: 0,
          denominator: 20,
        },
      },
      products: [{
        masterProductId: UUID,
        revenue: 100,
        operatingProfit: -20,
        salesContribution: 0.1,
        positiveOperatingProfitContribution: 0,
        lossImpact: 1,
        salesRank: 1,
        positiveOperatingProfitRank: null,
        lossRank: 1,
        cumulativeSalesContribution: 0.1,
        cumulativePositiveOperatingProfitContribution: null,
        cumulativeLossImpact: 1,
        metricCompleteness: { sales: true, operatingProfit: true },
      }],
    });
    expect(analytics.products[0]?.lossImpact).toBe(1);
    expect(analytics.metrics.positiveOperatingProfit.denominator).toBe(100);
    expect(analytics.metrics.loss.denominator).toBe(20);
    expect(() => ProductAbcContributionAnalyticsSchema.parse({
      ...analytics,
      products: [{
        ...analytics.products[0]!,
        positiveOperatingProfitRank: 2,
        cumulativePositiveOperatingProfitContribution: 1,
      }],
    })).toThrow();
    expect(() => ProductAbcContributionAnalyticsSchema.parse({
      ...analytics,
      products: [{
        ...analytics.products[0]!,
        operatingProfit: 20,
        positiveOperatingProfitContribution: 0.2,
        positiveOperatingProfitRank: 1,
        cumulativePositiveOperatingProfitContribution: 0.2,
        lossImpact: 0,
        lossRank: 2,
        cumulativeLossImpact: 1,
      }],
    })).toThrow();
    const zeroDenominator = ProductAbcContributionAnalyticsSchema.parse({
      ...analytics,
      totals: { ...analytics.totals, revenue: 0 },
      metrics: {
        ...analytics.metrics,
        sales: {
          ...analytics.metrics.sales,
          denominator: null,
          status: 'NO_DENOMINATOR',
        },
      },
      products: [{
        ...analytics.products[0]!,
        revenue: 0,
        salesContribution: null,
        salesRank: null,
        cumulativeSalesContribution: null,
      }],
    });
    expect(zeroDenominator.metrics.sales.status).toBe('NO_DENOMINATOR');
  });
});
