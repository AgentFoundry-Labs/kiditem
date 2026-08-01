import { describe, expect, it } from 'vitest';
import {
  SellpiaProductDestinationSchema,
  SellpiaProductInventoryResolutionSchema,
  SellpiaProductSalesRowSchema,
  SellpiaProductSalesSummarySchema,
} from '../dashboard';

const INVENTORY_SKU_ID = '11111111-1111-4111-8111-111111111111';
const MASTER_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_VARIANT_ID = '33333333-3333-4333-8333-333333333333';

const abcEvaluation = {
  abcGrade: 'A' as const,
  calculationStatus: 'READY' as const,
  rawScore: 80,
  adjustedScore: 75,
  reliability: 0.8,
  weightedRevenue: 200,
  weightedOrderTimeCogs: 100,
  weightedAdSpend: 0,
  weightedContributionProfit: 100,
  profitVelocity30: 50,
  weightedContributionMargin: 0.5,
  lossRecurrence: 0,
  paidOrderCount: 40,
  observationDays: 60,
  firstValidPaidSaleAt: '2026-06-01T00:00:00.000Z',
  formula: {
    formulaKey: 'ABC_V1' as const,
    version: 1,
    calculationCodeChecksum: 'a'.repeat(64),
    formulaChecksum: 'a'.repeat(64),
    activatedAt: '2026-07-18T00:00:00.000Z',
    halfLifeDays: 90,
    weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
    orderShrinkK: 20,
    dayShrinkK: 30,
    cutoffs: { cToB: 45, bToA: 70 },
    normalizationKnots: {
      profitVelocity: [{ value: 0, score: 0 }],
      contributionMargin: [{ value: 0, score: 0 }],
      lossRecurrence: [{ value: 0, score: 100 }],
    },
    trainingRange: { from: '2025-07-01', to: '2026-07-17' },
    sampleCount: 100,
    foldCount: 3,
    calibrationMetrics: { meanSpearmanRankCorrelation: 0.7, meanExplainedVariance: 0.6, gradeChurnRate: 0.1 },
  },
  sourceFreshness: {
    evaluationCutoffDate: '2026-07-17',
    sellpia: { status: 'READY' as const, coverageStartDate: '2025-06-12', coverageEndDate: '2026-07-17', capturedAt: '2026-07-18T00:00:00.000Z' },
    advertising: { status: 'CONFIRMED_ZERO' as const, coverageStartDate: '2025-06-12', coverageEndDate: '2026-07-17', capturedAt: '2026-07-18T00:00:00.000Z' },
  },
  costBreakdown: {
    recognizedRevenue: { amount: 200, status: 'OBSERVED' as const },
    orderTimeCogs: { amount: 100, status: 'OBSERVED' as const },
    advertisingSpend: { amount: 0, status: 'CONFIRMED_ZERO' as const },
    marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' as const },
    outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' as const },
    returnLoss: { amount: 0, status: 'NOT_APPLIED' as const },
    otherVariableCost: { amount: 0, status: 'NOT_APPLIED' as const },
  },
  statusDetail: null,
  calculatedAt: '2026-07-18T00:00:00.000Z',
};

const destination = {
  masterProductId: MASTER_PRODUCT_ID,
  masterProductCode: 'MP-1',
  masterProductName: '운영 상품',
  productVariantId: PRODUCT_VARIANT_ID,
  productVariantCode: 'PV-1',
  productVariantName: '기본 옵션',
  unitsPerVariant: 1,
  abcGrade: 'A',
  abcEvaluation,
  displayImage: {
    url: 'https://image.coupangcdn.com/catalog.jpg',
    source: 'channel_catalog',
    channel: 'coupang',
    channelListingId: '44444444-4444-4444-8444-444444444444',
    externalOptionId: null,
  },
};

function salesRow() {
  return {
    productCode: 'SP-1',
    optionCode: 'OPT-1',
    productName: '셀피아 상품',
    optionName: null,
    providerName: null,
    salePrice: 10_000,
    buyPrice: 5_000,
    barcode: '880000000001',
    monthly: [],
    qty1m: 10,
    qty2m: 20,
    avg2m: 10,
    totalQty: 20,
    trend: 'flat',
    deadStock: false,
    deadStockReason: null,
    seasonTag: null,
    anomaly: false,
    anomalyReason: null,
    inventoryResolution: {
      status: 'matched',
      sellpiaInventorySkuId: INVENTORY_SKU_ID,
      currentStock: 30,
      activeCommitmentQuantity: 5,
      availableStock: 25,
      salesRowCount: 1,
      destinations: [destination],
    },
    monthsOfAvailableStockLeft: 2.5,
    reorderPoint: 15,
    needsReorder: false,
  } as const;
}

describe('Sellpia product-sales inventory contracts', () => {
  it('distinguishes inventory not collected from mapping required', () => {
    expect(SellpiaProductInventoryResolutionSchema.parse({
      status: 'not_collected',
    })).toEqual({ status: 'not_collected' });

    for (const reason of [
      'not_found',
      'inactive_candidate',
      'ambiguous_barcode',
    ] as const) {
      expect(SellpiaProductInventoryResolutionSchema.parse({
        status: 'mapping_required',
        reason,
        candidateCount: reason === 'not_found' ? 0 : 2,
      })).toMatchObject({ status: 'mapping_required', reason });
    }
  });

  it('preserves matched availability and operational destinations', () => {
    const matched = salesRow().inventoryResolution;
    expect(SellpiaProductInventoryResolutionSchema.parse(matched)).toEqual(matched);
  });

  it('keeps published, observing, and unclassified destinations distinguishable', () => {
    const observingEvaluation = {
      ...abcEvaluation,
      abcGrade: null,
      calculationStatus: 'INSUFFICIENT_EVIDENCE' as const,
      rawScore: null,
      adjustedScore: null,
      reliability: null,
      weightedContributionProfit: null,
      formula: null,
    };
    expect(SellpiaProductDestinationSchema.parse(destination)).toMatchObject({ abcGrade: 'A' });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abcGrade: null, abcEvaluation: observingEvaluation }))
      .toMatchObject({ abcEvaluation: { calculationStatus: 'INSUFFICIENT_EVIDENCE' } });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abcGrade: null, abcEvaluation: null }))
      .toMatchObject({ abcEvaluation: null });
  });

  it('requires a read-only channel catalog display image shape when present', () => {
    expect(SellpiaProductInventoryResolutionSchema.parse(salesRow().inventoryResolution))
      .toEqual(salesRow().inventoryResolution);
    expect(() => SellpiaProductInventoryResolutionSchema.parse({
      ...salesRow().inventoryResolution,
      destinations: [{ ...destination, displayImage: {
        ...destination.displayImage,
        source: 'manual_upload',
      } }],
    })).toThrow();
  });

  it('rejects inconsistent matched availability', () => {
    expect(() => SellpiaProductInventoryResolutionSchema.parse({
      ...salesRow().inventoryResolution,
      availableStock: 30,
    })).toThrow(/availableStock/i);
  });

  it('uses available-stock coverage instead of the legacy nullable stock fields', () => {
    expect(SellpiaProductSalesRowSchema.parse(salesRow())).toEqual(salesRow());
    const { inventoryResolution: _inventoryResolution, ...withoutResolution } = salesRow();
    expect(() => SellpiaProductSalesRowSchema.parse({
      ...withoutResolution,
      currentStock: 30,
      monthsOfStockLeft: 3,
    })).toThrow(/inventoryResolution/i);
  });

  it('groups mapping counts and carries the raw stock snapshot generation', () => {
    const summary = {
      range: { from: '2026-05', to: '2026-06' },
      months: ['2026-05', '2026-06'],
      completeMonths: ['2026-05', '2026-06'],
      products: [salesRow()],
      productCount: 1,
      totalQty: 20,
      lastCapturedAt: '2026-07-18T00:00:00.000Z',
      hasData: true,
      hasStock: true,
      stockCapturedAt: '2026-07-18T00:00:00.000Z',
      stockGeneration: '12',
      inventoryResolutionCounts: {
        matchedSalesRows: 1,
        mappingRequiredSalesRows: 0,
        matchedSkus: 1,
        unlinkedSkus: 0,
      },
      reorderCount: 0,
      deadStockCount: 0,
      anomalyCount: 0,
      abcCounts: { A: 1, B: 0, C: 0 },
      abcStatusCounts: {
        READY: 1,
        INSUFFICIENT_EVIDENCE: 0,
        SOURCE_UNMAPPED: 0,
        CALIBRATION_PENDING: 0,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
      },
      abcContributionProfitByGrade: { A: 100, B: 0, C: 0 },
      classifiedProductCount: 1,
      unclassifiedProductCount: 0,
      leadTimeMonths: 1,
    };

    expect(SellpiaProductSalesSummarySchema.parse(summary)).toEqual(summary);
  });
});
