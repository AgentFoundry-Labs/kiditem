import { describe, expect, it } from 'vitest';
import {
  CreateMasterProductInputSchema,
  MasterProductOperationsMetadataSchema,
  MasterProductOperationsDetailSchema,
  MasterProductOperationsListItemSchema,
  MasterProductOperationsListQuerySchema,
  MasterProductOperationsListResponseSchema,
  ProductOperationsAbcCalculationStatusFilterSchema,
  ProductOperationsDataStatusSchema,
  ProductOperationsInventoryFocusSchema,
  ProductOperationsListSummarySchema,
  ProductDepletionProjectionSchema,
  ProductInventoryStatusSchema,
  ProductRecipeComponentCandidateListResponseSchema,
  ProductRecipeComponentCandidateQuerySchema,
  ReplaceChannelOptionInventoryInputSchema,
  UpdateMasterProductInputSchema,
} from './product-operations';

const productId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const skuId = '00000000-0000-4000-8000-000000000003';

const createProductDetailFixture = (availableStock = 80) => ({
  id: productId,
  code: 'KI-001',
  displayReference: {
    type: 'channel_product',
    label: 'Coupang Wing 상품번호',
    value: '13712531060',
  },
  name: '키즈 식판',
  description: null,
  category: '주방',
  brand: null,
  tags: [],
  imageUrls: [],
  displayImageUrls: [],
  abcGrade: null,
  abcEvaluation: null,
  profitTag: null,
  adTier: null,
  adBudgetLimit: null,
  healthScore: null,
  healthUpdatedAt: null,
  isActive: true,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  inventoryStatus: 'sellable',
  inventoryUnits: 80,
  channelListings: [{
    id: '00000000-0000-4000-8000-000000000004',
    channelAccountId: '00000000-0000-4000-8000-000000000005',
    channel: 'coupang',
    channelAccountName: 'Wing',
    externalId: 'P-001',
    displayName: '키즈 식판',
    status: 'approved',
    isActive: true,
    options: [{
      id: optionId,
      externalOptionId: 'P-001-DEFAULT',
      itemName: '기본',
      sellerSku: 'SP-001',
      barcode: null,
      status: 'approved',
      isActive: true,
      capacity: 8,
      inventoryComponents: [{
        id: '00000000-0000-4000-8000-000000000006',
        sellpiaInventorySkuId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: null,
        barcode: null,
        currentStock: 80,
        availableStock,
        isActive: true,
        quantity: 8,
      }],
    }],
  }],
});

const metadataFixture = {
  id: productId,
  code: 'KI-001',
  displayReference: {
    type: 'product_code' as const,
    label: '상품 코드',
    value: 'KI-001',
  },
  name: '키즈 식판',
  description: null,
  category: '주방',
  brand: null,
  tags: ['식판'],
  abcGrade: null,
  abcEvaluation: null,
  profitTag: null,
  adTier: null,
  adBudgetLimit: null,
  healthScore: null,
  healthUpdatedAt: null,
  isActive: true,
};

describe('product operations contracts', () => {
  it('uses calculation status instead of lifecycle/risk filters and exposes profitability summary', () => {
    expect(ProductOperationsAbcCalculationStatusFilterSchema.parse('AD_SOURCE_STALE')).toBe('AD_SOURCE_STALE');
    expect(MasterProductOperationsListQuerySchema.parse({}).activeStatus).toBe('active');
    expect(MasterProductOperationsListQuerySchema.parse({
      abcCalculationStatus: 'READY',
    }).abcCalculationStatus).toBe('READY');
    expect(MasterProductOperationsListQuerySchema.safeParse({ abcStage: 'NEW' }).success).toBe(false);
    expect(MasterProductOperationsListQuerySchema.safeParse({ abcRisk: 'LOSS' }).success).toBe(false);
    expect(ProductOperationsListSummarySchema.parse({
      abcGradeCounts: { A: 2, B: 3, C: 1, unclassified: 4 },
      abcStatusCounts: {
        READY: 6,
        INSUFFICIENT_EVIDENCE: 2,
        SOURCE_UNMAPPED: 1,
        CALIBRATION_PENDING: 1,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        ORDERS_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
      },
      abcContributionProfitByGrade: { A: 400_000, B: 150_000, C: -30_000 },
      abcContributionProfitShareByGrade: { A: 0.77, B: 0.29, C: -0.06 },
      abcFormula: null,
      displayDataAsOf: '2026-07-31',
      channelProductCounts: [{
        channelAccountId: '00000000-0000-4000-8000-000000000004',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
        count: 4,
      }],
      inventoryStatusCounts: {
        sellable: 6,
        partial_out_of_stock: 1,
        out_of_stock: 1,
        configuration_required: 1,
        review_required: 1,
      },
      negativeProfitCount: 1,
      imminentProductCount: 3,
      reorderProductCount: 2,
      depletionCoveredProductCount: 6,
      sharedDepletionProductCount: 1,
    }).displayDataAsOf).toBe('2026-07-31');

    expect(ProductOperationsDataStatusSchema.parse({
      displayDataAsOf: '2026-07-31',
      lastCompletedRefreshAt: '2026-08-01T00:00:00.000Z',
      activeRun: null,
      sources: {
        traffic: { status: 'OUTDATED', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z', lastErrorAt: null },
        advertising: { status: 'NOT_COLLECTED', coverageEndDate: null, capturedAt: null, lastErrorAt: null },
        sellpiaProfit: { status: 'CURRENT', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z', lastErrorAt: null },
        abc: { status: 'CURRENT', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z', lastErrorAt: null },
      },
      abcSummary: {
        classifiedProductCount: 6,
        unclassifiedProductCount: 4,
        mappingRequiredProductCount: 1,
        orderEvidenceRequiredProductCount: 2,
        otherPendingProductCount: 1,
      },
    }).sources.advertising).toEqual({
      status: 'NOT_COLLECTED', coverageEndDate: null, capturedAt: null, lastErrorAt: null,
    });
  });

  it('rejects the retired legacy profit projection on strict list items', () => {
    const legacy = {
      ...MasterProductOperationsListItemSchema.parse({
        ...metadataFixture,
        imageUrls: [],
        displayImageUrls: [],
        isSelling: true,
        updatedAt: '2026-07-16T00:00:00.000Z',
        depletion: {
          coverage: 'no_direct_sales',
          needsReorder: false,
          reorderSkuCount: 0,
          minMonthsOfAvailableStockLeft: null,
        },
        channelOptionSummary: { total: 0, active: 0, configured: 0, warning: 0 },
        inventoryUnits: 0,
        inventoryStatus: 'configuration_required',
        channelCount: 0,
        channelStatus: 'unlisted',
        activeChannels: [],
        traffic: null,
        visitorCount: null,
        viewCount: null,
        cartAddCount: null,
        orderCount: null,
        salesQuantity: null,
        salesAmount: null,
        adSpend: null,
        adSpendRate: null,
        metricsFreshness: {
          traffic: { status: 'MISSING', coverageStartDate: null, coverageEndDate: null, capturedAt: null },
          advertising: { status: 'MISSING', coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        },
        contributionProfitVelocity30: null,
        contributionMargin: null,
      }),
      profit: 12_000,
    };

    expect(MasterProductOperationsListItemSchema.safeParse(legacy).success).toBe(false);
  });

  it('requires raw and calculated display image URLs separately', () => {
    const directImageMetadata = {
      ...metadataFixture,
      imageUrls: ['https://cdn.example.com/operator.jpg'],
      displayImageUrls: ['https://cdn.example.com/operator.jpg'],
    };
    const channelFallbackMetadata = {
      ...metadataFixture,
      imageUrls: [],
      displayImageUrls: ['https://cdn.example.com/channel.jpg'],
    };
    const noImageMetadata = {
      ...metadataFixture,
      imageUrls: [],
      displayImageUrls: [],
    };

    expect(MasterProductOperationsMetadataSchema.parse(directImageMetadata))
      .toMatchObject(directImageMetadata);
    expect(MasterProductOperationsMetadataSchema.parse(channelFallbackMetadata))
      .toMatchObject(channelFallbackMetadata);
    expect(MasterProductOperationsMetadataSchema.parse(noImageMetadata))
      .toMatchObject(noImageMetadata);

    const { displayImageUrls: _displayImageUrls, ...missingDisplay } = channelFallbackMetadata;
    expect(() => MasterProductOperationsMetadataSchema.parse(missingDisplay)).toThrow();
  });

  it('strictly parses the supported product list filters', () => {
    expect(MasterProductOperationsListQuerySchema.parse({
      page: 2,
      limit: 25,
      query: '  식판  ',
      periodDays: 14,
      category: '  주방  ',
      activeStatus: 'active',
      inventoryStatus: 'partial_out_of_stock',
      inventoryFocus: 'imminent',
      abcGrade: 'unclassified',
      abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
      adStatus: 'active',
    })).toMatchObject({
      query: '식판',
      category: '주방',
      periodDays: 14,
      abcGrade: 'unclassified',
      abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
      inventoryFocus: 'imminent',
    });
    expect(() => MasterProductOperationsListQuerySchema.parse({
      organizationId: productId,
    })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ periodDays: 15 })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcGrade: 'manual' })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcCalculationStatus: 'RETIRED' })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcCalculationStatus: 'LIMITED_HISTORY' })).toThrow();
  });

  it('exposes stored ABC as read-only product metadata', () => {
    expect(() => CreateMasterProductInputSchema.parse({
      code: 'KI-001',
      name: '식판',
      abcGrade: 'A',
    })).toThrow();
    expect(() => UpdateMasterProductInputSchema.parse({ abcGrade: 'B' })).toThrow();
  });

  it('freezes the product inventory status vocabulary', () => {
    expect(ProductInventoryStatusSchema.options).toEqual([
      'sellable',
      'partial_out_of_stock',
      'out_of_stock',
      'configuration_required',
      'review_required',
    ]);
  });

  it('freezes the product inventory command focus vocabulary', () => {
    expect(ProductOperationsInventoryFocusSchema.options).toEqual([
      'attention',
      'out_of_stock',
      'imminent',
      'reorder',
    ]);
  });

  it('strictly parses focused physical recipe component candidates', () => {
    expect(ProductRecipeComponentCandidateQuerySchema.parse({
      search: '  SP-001  ',
      limit: 20,
    })).toMatchObject({ search: 'SP-001', limit: 20 });
    expect(() => ProductRecipeComponentCandidateQuerySchema.parse({
      search: 'x',
      organizationId: productId,
    })).toThrow();

    expect(ProductRecipeComponentCandidateListResponseSchema.parse({
      items: [{
        sellpiaInventorySkuId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
      }],
    }).items[0]).toMatchObject({
      sellpiaInventorySkuId: skuId,
      currentStock: 8,
    });
  });

  it('parses nullable product-operation metrics separately from physical inventory units', () => {
    const parsed = MasterProductOperationsListItemSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: 'KI-001',
      },
      name: '키즈 식판',
      description: null,
      category: '주방',
      brand: null,
      tags: ['식판'],
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: 'A',
      abcEvaluation: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      isActive: true,
      isSelling: true,
      updatedAt: '2026-07-16T00:00:00.000Z',
      depletion: {
        coverage: 'shared',
        needsReorder: true,
        reorderSkuCount: 2,
        minMonthsOfAvailableStockLeft: 0.5,
      },
      channelOptionSummary: { total: 2, active: 2, configured: 1, warning: 1 },
      inventoryUnits: 80,
      inventoryStatus: 'configuration_required',
      channelCount: 2,
      channelStatus: 'partial',
      activeChannels: [{
        channelAccountId: '00000000-0000-4000-8000-000000000004',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
      }],
      traffic: null,
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      adSpend: null,
      adSpendRate: null,
      metricsFreshness: {
        traffic: { status: 'MISSING', coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        advertising: { status: 'MISSING', coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      },
      contributionProfitVelocity30: null,
      contributionMargin: null,
    });
    expect(parsed.inventoryUnits).toBe(80);
    expect(parsed.traffic).toBeNull();
    const response = MasterProductOperationsListResponseSchema.parse({
      items: [parsed],
      total: 80,
      page: 1,
      limit: 1,
      summary: {
        abcGradeCounts: { A: 23, B: 17, C: 40, unclassified: 0 },
        abcStatusCounts: {
          READY: 70,
          INSUFFICIENT_EVIDENCE: 4,
          SOURCE_UNMAPPED: 2,
          CALIBRATION_PENDING: 1,
          RECALCULATING: 1,
          SELLPIA_SOURCE_STALE: 1,
          AD_SOURCE_STALE: 1,
          ORDERS_SOURCE_STALE: 0,
          CALCULATION_ERROR: 0,
        },
        abcContributionProfitByGrade: { A: 4_000_000, B: 1_000_000, C: -200_000 },
        abcContributionProfitShareByGrade: { A: 0.83, B: 0.21, C: -0.04 },
        abcFormula: null,
        displayDataAsOf: '2026-07-31',
        channelProductCounts: [{
          channelAccountId: '00000000-0000-4000-8000-000000000004',
          channel: 'coupang',
          channelAccountName: 'Coupang Wing',
          count: 71,
        }],
        inventoryStatusCounts: {
          sellable: 41,
          partial_out_of_stock: 8,
          out_of_stock: 7,
          configuration_required: 19,
          review_required: 5,
        },
        negativeProfitCount: 6,
        imminentProductCount: 9,
        reorderProductCount: 12,
        depletionCoveredProductCount: 54,
        sharedDepletionProductCount: 7,
      },
    });
    expect(response.summary.abcGradeCounts.A).toBe(23);
    expect(response.summary.abcGradeCounts.unclassified).toBe(0);
    expect(response.summary.channelProductCounts[0]?.count).toBe(71);
    expect(response.summary.inventoryStatusCounts.out_of_stock).toBe(7);
    expect(response.summary.negativeProfitCount).toBe(6);
    expect(response.summary.displayDataAsOf).toBe('2026-07-31');
    expect(response.items[0]?.abcGrade).toBe('A');
    expect(response.items[0]?.viewCount).toBeNull();
    expect(response.items[0]?.activeChannels).toEqual([{
      channelAccountId: '00000000-0000-4000-8000-000000000004',
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
    }]);
    expect(response.items[0]?.depletion.coverage).toBe('shared');
  });

  it('keeps depletion coverage separate from manual operating metadata', () => {
    expect(ProductDepletionProjectionSchema.parse({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    })).toEqual({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    });
  });

  it('parses direct channel option components and capacity in product detail', () => {
    const detail = MasterProductOperationsDetailSchema.parse(createProductDetailFixture());
    expect(detail.channelListings[0]?.options[0]?.capacity).toBe(8);
    expect(detail.channelListings[0]?.options[0]?.inventoryComponents[0]?.sellpiaInventorySkuId).toBe(skuId);
    expect(detail.displayReference.value).toBe('13712531060');
  });

  it('requires component availability to equal physical current stock in product detail', () => {
    expect(() => MasterProductOperationsDetailSchema.parse(
      createProductDetailFixture(64),
    )).toThrow(/availableStock/i);
  });

  it('rejects negative component availability in product detail', () => {
    expect(() => MasterProductOperationsDetailSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-001' },
      name: '키즈 식판',
      description: null,
      category: null,
      brand: null,
      tags: [],
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: null,
      abcEvaluation: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      isActive: true,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      inventoryStatus: 'sellable',
      inventoryUnits: 80,
      channelListings: [{
        id: '00000000-0000-4000-8000-000000000004',
        channelAccountId: '00000000-0000-4000-8000-000000000005',
        channel: 'coupang',
        channelAccountName: 'Wing',
        externalId: 'P-001',
        displayName: '키즈 식판',
        status: 'approved',
        isActive: true,
        options: [{
          id: optionId,
          externalOptionId: 'P-001-DEFAULT',
          itemName: '기본',
          sellerSku: 'SP-001',
          barcode: null,
          status: 'approved',
          isActive: true,
          capacity: null,
          inventoryComponents: [{
            id: '00000000-0000-4000-8000-000000000006',
            sellpiaInventorySkuId: skuId,
            code: 'SP-001',
            name: '식판',
            optionName: null,
            barcode: null,
            currentStock: 80,
            availableStock: -1,
            isActive: true,
            quantity: 8,
          }],
        }],
      }],
    })).toThrow(/availableStock/i);
  });

  it('enforces product code normalization and mutation strictness', () => {
    expect(CreateMasterProductInputSchema.parse({
      code: '  KI-001  ',
      name: '  키즈 식판  ',
    })).toMatchObject({ code: 'KI-001', name: '키즈 식판' });
    expect(CreateMasterProductInputSchema.parse({ code: 'KI-001', name: '식판' }))
      .not.toHaveProperty('variants');
    expect(() => CreateMasterProductInputSchema.parse({
      code: 'KI-001',
      name: '식판',
      variants: [],
    })).toThrow();
    expect(() => CreateMasterProductInputSchema.parse({
      code: 'x'.repeat(101),
      name: '식판',
    })).toThrow();
    expect(() => UpdateMasterProductInputSchema.parse({})).toThrow();
  });

  it('accepts bounded direct channel option recipes with positive integer quantities', () => {
    expect(ReplaceChannelOptionInventoryInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 2 }],
    }).components).toHaveLength(1);
    expect(ReplaceChannelOptionInventoryInputSchema.parse({ components: [] }).components).toEqual([]);
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 0 }],
    })).toThrow();
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: Array.from({ length: 51 }, (_, index) => ({
        sellpiaInventorySkuId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        quantity: 1,
      })),
    })).toThrow();
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: [
        { sellpiaInventorySkuId: skuId, quantity: 1 },
        { sellpiaInventorySkuId: skuId, quantity: 2 },
      ],
    })).toThrow();
  });
});
