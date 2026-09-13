import { describe, expect, it } from 'vitest';
import {
  SellpiaProductDestinationSchema,
  SellpiaProductInventoryResolutionSchema,
  SellpiaProductSalesRowSchema,
  SellpiaProductSalesSummarySchema,
} from '../dashboard';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '../product-abc';

const INVENTORY_SKU_ID = '11111111-1111-4111-8111-111111111111';
const MASTER_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const CHANNEL_LISTING_OPTION_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_LISTING_ID = '44444444-4444-4444-8444-444444444444';
const SELLPIA_SOURCE_IMPORT_RUN_ID = '55555555-5555-4555-8555-555555555555';
const ADVERTISING_SOURCE_IMPORT_RUN_ID = '66666666-6666-4666-8666-666666666666';
const GRADE_BASIS_CUTOFF_DATE = '2026-07-17';

/** A published grade-A product: the shape the ABC producer emits for READY. */
const abcReadyEvaluation = {
  abcGrade: 'A' as const,
  weightedRevenue: 200,
  weightedOrderTimeSupplyCost: 100,
  weightedAdvertisingSpend: 0,
  weightedOperatingProfit: 100,
  operatingProfitVelocity30: 50,
  operatingMargin: 0.5,
  lossPersistence: 0,
  profitScore: 80,
  marginScore: 80,
  consistencyScore: 90,
  economicScore: 82,
  validObservationDays: 60,
  formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  formulaRevision: 2,
  publicationRevision: 4,
  gradeBasisCutoffDate: GRADE_BASIS_CUTOFF_DATE,
  saleStartDate: '2026-06-01',
  sellpiaSourceImportRunId: SELLPIA_SOURCE_IMPORT_RUN_ID,
  advertisingSourceImportRunId: ADVERTISING_SOURCE_IMPORT_RUN_ID,
  sellpiaGeneration: '7',
  advertisingGeneration: '7',
  mappingGeneration: '4',
  calculatedAt: '2026-07-18T00:00:00.000Z',
};

const abcReady = {
  abcGrade: 'A' as const,
  evaluation: abcReadyEvaluation,
  displayStatus: 'READY' as const,
  formulaRevision: 2,
  publicationRevision: 4,
  officialCutoffDate: GRADE_BASIS_CUTOFF_DATE,
  publishedAt: '2026-07-18T00:00:00.000Z',
  actualCutoffDate: GRADE_BASIS_CUTOFF_DATE,
  sources: {
    sellpia: {
      ready: true,
      requiredCutoff: GRADE_BASIS_CUTOFF_DATE,
      actualCutoff: GRADE_BASIS_CUTOFF_DATE,
      latestAttempt: { state: 'COMPLETE' as const },
      latestComplete: { actualCutoff: GRADE_BASIS_CUTOFF_DATE },
    },
    advertising: {
      ready: true,
      requiredCutoff: GRADE_BASIS_CUTOFF_DATE,
      actualCutoff: GRADE_BASIS_CUTOFF_DATE,
      latestAttempt: { state: 'COMPLETE' as const },
      latestComplete: { actualCutoff: GRADE_BASIS_CUTOFF_DATE },
    },
    mapping: { valid: true, currentMappingGeneration: '4', evidenceMappingGeneration: '4' },
  },
};

// Retired pre-read-model Evaluation shape. It survives only because the
// pending "published, observing, and unclassified" test below still describes
// the three-way distinction the read model no longer expresses; that test is
// blocked on a product decision, so neither it nor this literal is rewritten.

const destination = {
  masterProductId: MASTER_PRODUCT_ID,
  masterProductCode: 'MP-1',
  masterProductName: '운영 상품',
  channelListingOptionId: CHANNEL_LISTING_OPTION_ID,
  channelListingId: CHANNEL_LISTING_ID,
  channel: 'coupang',
  externalOptionId: 'option-1',
  optionName: '기본 옵션',
  unitsPerSale: 1,
  abc: abcReady,
  displayImage: {
    url: 'https://image.coupangcdn.com/catalog.jpg',
    source: 'channel_catalog',
    channel: 'coupang',
    channelListingId: CHANNEL_LISTING_ID,
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
      availableStock: 30,
      salesRowCount: 1,
      inventoryProduct: {
        masterProductId: MASTER_PRODUCT_ID,
        masterProductCode: 'MP-1',
        masterProductName: '재고 상품',
        abc: abcReady,
      },
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

  it('keeps a graded destination, a stale one that keeps its grade, and an unclassified one distinguishable', () => {
    // A stale source does not erase a published grade. The Evaluation and the
    // grade stay; `displayStatus` is what says the source has moved on.
    const stale = { ...abcReady, displayStatus: 'AD_SOURCE_STALE' as const };
    // `NEW` and `INSUFFICIENT_EVIDENCE` retain no Evaluation at all. There is
    // no state that keeps an Evaluation without a grade: `ProductAbcEvaluation`
    // always carries one, so an ungraded product has nothing to retain.
    const unclassified = {
      ...abcReady,
      abcGrade: null,
      evaluation: null,
      officialCutoffDate: null,
      displayStatus: 'INSUFFICIENT_EVIDENCE' as const,
    };

    expect(SellpiaProductDestinationSchema.parse(destination).abc)
      .toMatchObject({ abcGrade: 'A', displayStatus: 'READY' });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abc: stale }).abc)
      .toMatchObject({ abcGrade: 'A', displayStatus: 'AD_SOURCE_STALE' });
    expect(SellpiaProductDestinationSchema.parse({ ...destination, abc: unclassified }).abc)
      .toMatchObject({ abcGrade: null, evaluation: null, displayStatus: 'INSUFFICIENT_EVIDENCE' });
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
      availableStock: 29,
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
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      },
      abcContributionProfitByGrade: { A: 100, B: 0, C: 0 },
      classifiedProductCount: 1,
      unclassifiedProductCount: 0,
      leadTimeMonths: 1,
    };

    expect(SellpiaProductSalesSummarySchema.parse(summary)).toEqual(summary);
  });
});
