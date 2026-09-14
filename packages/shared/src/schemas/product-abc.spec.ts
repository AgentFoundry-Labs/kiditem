import { describe, expect, it } from 'vitest';

import {
  PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
  PRODUCT_ABC_ABSOLUTE_V1_ANCHORS,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_JSON,
  parseProductAbcDateToKstCalendarDate,
  productAbcSaleAgeDays,
  ProductAbcContributionAnalyticsSchema,
  ProductAbcDisplayStatusSchema,
  ProductAbcEvaluationSchema,
  ProductAbcFormulaPayloadSchema,
  ProductAbcGradeHistorySchema,
  ProductAbcReadModelSchema,
} from './product-abc.js';
import {
  PRODUCT_ABC_CONTRIBUTION_STATUS_LABELS,
  PRODUCT_ABC_DISPLAY_STATUS_LABELS,
  PRODUCT_ABC_MAPPING_STATUS_LABELS,
  productAbcContributionMetricStatus,
  productAbcDisplayStatus,
  productAbcMappingStatus,
} from '../product-abc.js';

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
    formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
    formulaRevision: 1,
    publicationRevision: 1,
    gradeBasisCutoffDate: '2026-07-31',
    saleStartDate: '2026-06-01',
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
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { actualCutoff: '2026-08-31' },
    },
    advertising: {
      ready: false,
      requiredCutoff: '2026-09-01',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'FAILED', errorCode: 'marketplace_login' },
      latestComplete: { actualCutoff: '2026-08-31' },
    },
    mapping: {
      valid: true,
      currentMappingGeneration: '4',
      evidenceMappingGeneration: '4',
    },
  };
}

describe('absolute product profitability ABC contracts', () => {
  it('locks the current V2 payload, anchors, policy hash, and precision', () => {
    expect(ProductAbcFormulaPayloadSchema.parse(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD))
      .toEqual(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey).toBe('PRODUCT_ABC_ABSOLUTE');
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version).toBe(2);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.anchors).toEqual(PRODUCT_ABC_ABSOLUTE_V1_ANCHORS);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.minimumSaleAgeDays).toBe(30);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.requiresCompleteEvaluationPeriod).toBe(true);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.velocityPeriodDays).toBe(30);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.maxCalendarMonths).toBe(12);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.includePartialCutoffMonth).toBe(true);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.hardC).toEqual({
      weightedOperatingProfitLte: 0,
      operatingMarginLte: 0,
      lossPersistenceGte: 0.5,
    });
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.gradeThresholds).toEqual({
      aEconomicScoreGte: 80,
      aMarginScoreGte: 60,
      aConsistencyScoreGte: 60,
      bEconomicScoreGte: 50,
    });
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.precision).toEqual({
      arithmetic: 'IEEE-754_BINARY64',
      persistedScale: 6,
      rounding: 'ROUND_HALF_UP',
      thresholdComparison: 'UNROUNDED',
    });
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.adSourcePolicyHash)
      .toBe(PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH).not.toContain('TODO');
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_JSON).toContain('PRODUCT_ABC_ABSOLUTE');
  });

  it('does not accept drifted anchors, policy hash, or removed compatibility fields', () => {
    expect(() => ProductAbcFormulaPayloadSchema.parse({
      ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
      anchors: {
        ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.anchors,
        profitVelocity30: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.anchors.profitVelocity30.map(
          (point, index) => index === 1 ? { ...point, score: 21 } : point,
        ),
      },
    })).toThrow();
    expect(() => ProductAbcFormulaPayloadSchema.parse({
      ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
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
        ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
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
      'SOURCE_UNMAPPED',
      'SELLPIA_SOURCE_STALE',
      'AD_SOURCE_STALE',
      'INSUFFICIENT_EVIDENCE',
      'READY',
    ]);

    const stale = ProductAbcReadModelSchema.parse({
      abcGrade: 'A',
      evaluation: parsed,
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-08-31',
      sources: sourceFreshness(),
    });
    expect(stale.evaluation?.abcGrade).toBe('A');
    expect(stale.publicationRevision).toBe(4);
    expect(stale.sources.advertising.actualCutoff).toBe('2026-08-31');
    expect(ProductAbcReadModelSchema.safeParse({
      ...stale,
      recalculationPending: false,
    }).success).toBe(false);
    // The display word is a function of these facts; the read model never carries it.
    expect(ProductAbcReadModelSchema.safeParse({
      ...stale,
      displayStatus: 'AD_SOURCE_STALE',
    }).success).toBe(false);
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
      abcGrade: null,
      evaluation: null,
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-07-31',
      sources: sourceFreshness(),
    })).not.toThrow();
  });

  it('derives one display word from mapping, source readiness and evaluation facts', () => {
    const retained = ProductAbcEvaluationSchema.parse(evaluation());
    const facts = (overrides: {
      mapped?: boolean;
      sellpia?: boolean;
      advertising?: boolean;
      evaluated?: boolean;
    } = {}) => ({
      evaluation: overrides.evaluated === false ? null : retained,
      sources: {
        mapping: { valid: overrides.mapped ?? true },
        sellpia: { ready: overrides.sellpia ?? true },
        advertising: { ready: overrides.advertising ?? true },
      },
    });

    expect(productAbcDisplayStatus(facts())).toBe('READY');
    expect(productAbcDisplayStatus(facts({ evaluated: false }))).toBe('INSUFFICIENT_EVIDENCE');
    // A stale source keeps the retained grade; the word says which source moved on.
    expect(productAbcDisplayStatus(facts({ advertising: false }))).toBe('AD_SOURCE_STALE');
    expect(productAbcDisplayStatus(facts({ sellpia: false, advertising: false })))
      .toBe('SELLPIA_SOURCE_STALE');
    expect(productAbcDisplayStatus(facts({ mapped: false, sellpia: false, evaluated: false })))
      .toBe('SOURCE_UNMAPPED');

    const published = ProductAbcReadModelSchema.parse({
      abcGrade: 'A',
      evaluation: retained,
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-08-31',
      sources: sourceFreshness(),
    });
    expect(productAbcDisplayStatus(published)).toBe('AD_SOURCE_STALE');
    expect(PRODUCT_ABC_DISPLAY_STATUS_LABELS).toEqual({
      READY: '계산 완료',
      INSUFFICIENT_EVIDENCE: '관찰 중',
      SOURCE_UNMAPPED: '상품 매핑 필요',
      SELLPIA_SOURCE_STALE: 'Sellpia 원천 갱신 필요',
      AD_SOURCE_STALE: '광고비 원천 갱신 필요',
    });
  });

  it('rejects rolled calendar dates and out-of-range timestamps before KST normalization', () => {
    expect(parseProductAbcDateToKstCalendarDate('2026-02-29')).toBeNull();
    expect(parseProductAbcDateToKstCalendarDate('2026-02-31T00:00:00Z')).toBeNull();
    expect(parseProductAbcDateToKstCalendarDate('2026-01-01T24:00:00Z')).toBeNull();
    expect(parseProductAbcDateToKstCalendarDate('2026-01-01T23:60:00Z')).toBeNull();
    expect(parseProductAbcDateToKstCalendarDate('2026-01-01T23:00:00+02:00')).toBe('2026-01-02');
    expect(productAbcSaleAgeDays('2026-02-31', '2026-03-31')).toBeNull();
    expect(productAbcSaleAgeDays('2026-03-01T00:00:00Z', '2026-03-31')).toBe(30);
  });

  it('derives mapping words and labels from mapping facts without carrying a wire status', () => {
    expect(productAbcMappingStatus({
      valid: true,
      currentMappingGeneration: '4',
      evidenceMappingGeneration: '4',
    })).toBe('READY');
    expect(productAbcMappingStatus({
      valid: true,
      currentMappingGeneration: '5',
      evidenceMappingGeneration: '4',
    })).toBe('STALE');
    expect(productAbcMappingStatus({
      valid: false,
      currentMappingGeneration: '5',
      evidenceMappingGeneration: '5',
    })).toBe('UNMAPPED');
    expect(PRODUCT_ABC_MAPPING_STATUS_LABELS).toEqual({
      READY: '매핑 최신',
      UNMAPPED: '상품 매핑 필요',
      STALE: '매핑 갱신 필요',
    });
    expect(PRODUCT_ABC_DISPLAY_STATUS_LABELS.READY).toBe('계산 완료');
    expect(ProductAbcReadModelSchema.safeParse({
      abcGrade: 'A',
      evaluation: evaluation(),
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: ISO,
      actualCutoffDate: '2026-07-31',
      sources: {
        ...sourceFreshness(),
        mapping: {
          ...sourceFreshness().mapping,
          status: 'READY',
        },
      },
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
      },
      totals: {
        revenue: 1_000,
        positiveOperatingProfit: 100,
        lossMagnitude: 20,
        netOperatingProfit: 80,
      },
      metrics: {
        sales: {
          sourceComplete: true,
          includedProductCount: 2,
          excludedProductCount: 0,
          denominator: 1_000,
        },
        positiveOperatingProfit: {
          sourceComplete: true,
          includedProductCount: 2,
          excludedProductCount: 0,
          denominator: 100,
        },
        loss: {
          sourceComplete: true,
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
    expect(productAbcContributionMetricStatus(zeroDenominator.metrics.sales))
      .toBe('NO_DENOMINATOR');
    expect(productAbcContributionMetricStatus({
      sourceComplete: false,
      includedProductCount: 1,
      excludedProductCount: 0,
      denominator: 100,
    })).toBe('SOURCE_INCOMPLETE');
    expect(productAbcContributionMetricStatus({
      sourceComplete: true,
      includedProductCount: 1,
      excludedProductCount: 1,
      denominator: 100,
    })).toBe('SOURCE_INCOMPLETE');
    expect(PRODUCT_ABC_CONTRIBUTION_STATUS_LABELS.NO_DENOMINATOR).toBe('비중 미산출');
    expect(ProductAbcContributionAnalyticsSchema.safeParse({
      ...analytics,
      metrics: {
        ...analytics.metrics,
        sales: { ...analytics.metrics.sales, status: 'READY' },
      },
    }).success).toBe(false);
  });
});
