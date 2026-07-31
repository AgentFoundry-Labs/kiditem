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
  provisionalGrade: null,
  lifecycleStage: 'ESTABLISHED' as const,
  confidence: 'HIGH' as const,
  eligibilityReason: 'ELIGIBLE' as const,
  riskFlags: [],
  observedCompleteMonths: 12,
  observationStartMonth: '2025-07',
  periodMetricValue: 100,
  rankingValue: 100,
  grossRevenue: 200,
  grossCost: 100,
  grossProfit: 100,
  grossMarginRate: 50,
  contributionRate: 70,
  cumulativeContributionRate: 70,
  calculatedAt: '2026-07-18T00:00:00.000Z',
  sourceCapturedAt: '2026-07-17T00:00:00.000Z',
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

  it('keeps official, lifecycle, risk, and legacy destinations distinguishable', () => {
    const newEvaluation = {
      ...abcEvaluation,
      abcGrade: null,
      lifecycleStage: 'NEW' as const,
      confidence: 'LOW' as const,
      observedCompleteMonths: 2,
      riskFlags: ['LIMITED_HISTORY'],
    };
    const provisionalEvaluation = {
      ...abcEvaluation,
      abcGrade: null,
      lifecycleStage: 'PROVISIONAL' as const,
      confidence: 'LOW' as const,
      provisionalGrade: 'B' as const,
      observedCompleteMonths: 4,
      riskFlags: ['LIMITED_HISTORY'],
    };
    const lossEvaluation = {
      ...abcEvaluation,
      abcGrade: null,
      grossProfit: -10,
      riskFlags: ['LOSS'],
    };
    expect(SellpiaProductDestinationSchema.parse(destination)).toMatchObject({ abcGrade: 'A' });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abcGrade: null, abcEvaluation: newEvaluation }))
      .toMatchObject({ abcEvaluation: { lifecycleStage: 'NEW' } });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abcGrade: null, abcEvaluation: provisionalEvaluation }))
      .toMatchObject({ abcEvaluation: { provisionalGrade: 'B' } });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abcGrade: null, abcEvaluation: lossEvaluation }))
      .toMatchObject({ abcEvaluation: { riskFlags: ['LOSS'], grossProfit: -10 } });
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
      abcLifecycleCounts: { NEW: 0, PROVISIONAL: 0, ESTABLISHED: 1 },
      abcRiskCounts: { loss: 0, zeroValue: 0, dataQuality: 0 },
      classifiedProductCount: 1,
      unclassifiedProductCount: 0,
      leadTimeMonths: 1,
    };

    expect(SellpiaProductSalesSummarySchema.parse(summary)).toEqual(summary);
  });
});
