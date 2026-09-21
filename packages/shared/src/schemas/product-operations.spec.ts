import { describe, expect, it } from 'vitest';
import {
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
import { buildPeriodBasis } from './dashboard-basis';

const productId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const skuId = '00000000-0000-4000-8000-000000000003';
const abcFixture = {
  abcGrade: null,
  evaluation: null,
  formulaRevision: 0,
  publicationRevision: 0,
  officialCutoffDate: null,
  publishedAt: null,
  actualCutoffDate: null,
  sources: {
    sellpia: missingAbcSource(),
    advertising: missingAbcSource(),
    mapping: { valid: false, currentMappingGeneration: '0', evidenceMappingGeneration: null },
  },
};

const createProductDetailFixture = (currentStock = 80) => ({
  id: productId,
  code: 'KI-001',
  displayReference: {
    type: 'channel_product',
    label: 'Coupang Wing 상품번호',
    value: '13712531060',
  },
  name: '키즈 식판',
  imageUrls: [],
  displayImageUrls: [],
  abcGrade: null,
  abcEvaluation: null,
  abc: abcFixture,
  contribution: null,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  inventory: { skuCount: 1, measuredSkuCount: 1 },
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
        masterProductId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: null,
        barcode: null,
        currentStock,
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
  abcGrade: null,
  abcEvaluation: null,
  abc: abcFixture,
  contribution: null,
};

function missingAbcSource() {
  return {
    ready: false,
    requiredCutoff: '2026-07-31',
    actualCutoff: null,
    latestAttempt: null,
    latestComplete: null,
  };
}

function dataStatusSource(ready: boolean) {
  return {
    ready,
    requiredCutoff: '2026-07-31',
    actualCutoff: ready ? '2026-07-31' : null,
    latestAttempt: ready ? { state: 'COMPLETE' as const } : null,
    latestComplete: ready ? { actualCutoff: '2026-07-31' } : null,
  };
}

const uncoveredTrafficBasis = buildPeriodBasis({
  from: '2026-07-10',
  to: '2026-07-16',
  sources: ['wing_traffic'],
});

function listItemWithTrafficFreshness(traffic: Record<string, unknown>) {
  return {
    ...metadataFixture,
    imageUrls: [],
    displayImageUrls: [],
    isSelling: true,
    updatedAt: '2026-09-15T00:00:00.000Z',
    depletion: {
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    },
    channelOptionSummary: { total: 0, active: 0, configured: 0, warning: 0 },
    inventoryUnits: 0,
    inventory: { skuCount: 0, measuredSkuCount: 0 },
    channelCount: 1,
    channelStatus: 'listed',
    activeChannels: [],
    traffic: null,
    visitorCount: null,
    viewCount: 91,
    cartAddCount: 26,
    orderCount: null,
    salesQuantity: null,
    salesAmount: null,
    adSpend: null,
    adSpendRate: null,
    metricsFreshness: {
      orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      traffic,
      advertising: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
    },
  };
}

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
      contributionOverview: null,
      abcFormula: null,
      abcOfficialCutoffDate: '2026-07-31',
      displayDataAsOf: '2026-07-31',
      channelProductCounts: [{
        channelAccountId: '00000000-0000-4000-8000-000000000004',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
        count: 4,
      }],
      inventoryStatusCounts: {
        sellable: 6,
        out_of_stock: 1,
        configuration_required: 1,
        review_required: 1,
        uncollected: 0,
      },
      negativeProfitCount: 1,
      imminentProductCount: 3,
      reorderProductCount: 2,
      depletionCoveredProductCount: 6,
    }).displayDataAsOf).toBe('2026-07-31');

    expect(ProductOperationsDataStatusSchema.parse({
      displayDataAsOf: '2026-07-31',
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      publishedAt: '2026-08-01T00:00:00.000Z',
      actualCutoff: '2026-07-31',
      sources: {
        traffic: dataStatusSource(true),
        orders: dataStatusSource(true),
        advertising: dataStatusSource(false),
        sellpia: dataStatusSource(true),
        mapping: { ready: true, generation: '7' },
      },
      abcSummary: {
        classifiedProductCount: 6,
        unclassifiedProductCount: 4,
        mappingRequiredProductCount: 1,
        otherPendingProductCount: 1,
      },
    }).sources.advertising).toEqual(dataStatusSource(false));
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
        inventory: { skuCount: 0, measuredSkuCount: 0 },
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
          orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
          traffic: { capturedAt: null, basis: uncoveredTrafficBasis },
          advertising: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        },
      }),
      profit: 12_000,
    };

    expect(MasterProductOperationsListItemSchema.safeParse(legacy).success).toBe(false);
  });

  it('carries only the capture time and the period basis on Wing traffic freshness', () => {
    const basis = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-14',
      includedDates: Array.from({ length: 13 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
      sources: ['wing_traffic'],
    });
    const traffic = { capturedAt: '2026-09-15T00:00:00.000Z', basis };

    const parsed = MasterProductOperationsListItemSchema.parse(listItemWithTrafficFreshness(traffic));
    expect(Object.keys(parsed.metricsFreshness.traffic).sort()).toEqual(['basis', 'capturedAt']);
    expect(parsed.metricsFreshness.traffic.basis).toEqual(basis);
    // The basis already says whether, and over which dates, traffic was measured.
    for (const derived of [
      { ready: true },
      { coverageStartDate: '2026-09-01' },
      { coverageEndDate: '2026-09-14' },
    ]) {
      expect(MasterProductOperationsListItemSchema.safeParse(
        listItemWithTrafficFreshness({ ...traffic, ...derived }),
      ).success).toBe(false);
    }
    const { basis: _basis, ...withoutBasis } = traffic;
    expect(MasterProductOperationsListItemSchema.safeParse(listItemWithTrafficFreshness(withoutBasis)).success)
      .toBe(false);
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

  it('strictly parses supported product list filters without source category', () => {
    expect(MasterProductOperationsListQuerySchema.parse({
      page: 2,
      limit: 25,
      query: '  식판  ',
      periodDays: 14,
      activeStatus: 'active',
      inventoryStatus: 'uncollected',
      inventoryFocus: 'imminent',
      abcGrade: 'unclassified',
      abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
      adStatus: 'active',
    })).toMatchObject({
      query: '식판',
      periodDays: 14,
      abcGrade: 'unclassified',
      abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
      inventoryFocus: 'imminent',
    });
    expect(() => MasterProductOperationsListQuerySchema.parse({ category: '주방' })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({
      organizationId: productId,
    })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ periodDays: 15 })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcGrade: 'manual' })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcCalculationStatus: 'RETIRED' })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ abcCalculationStatus: 'LIMITED_HISTORY' })).toThrow();
  });

  it('exposes stored ABC as response metadata and excludes it from image updates', () => {
    const metadata = MasterProductOperationsMetadataSchema.parse({
      ...metadataFixture,
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: 'A',
    });
    expect(metadata.abcGrade).toBe('A');
    expect(() => UpdateMasterProductInputSchema.parse({ imageUrls: [], abcGrade: 'B' })).toThrow();
  });

  it.each(['adTier', 'profitTag'] as const)(
    'carries no operator %s on product metadata or mutations',
    (operatorField) => {
      const results = [
        UpdateMasterProductInputSchema.safeParse({ imageUrls: [], [operatorField]: null }),
        MasterProductOperationsMetadataSchema.safeParse({
          ...metadataFixture,
          imageUrls: [],
          displayImageUrls: [],
          [operatorField]: null,
        }),
      ];

      for (const result of results) {
        expect(result.success).toBe(false);
      }
    },
  );

  it('freezes the product inventory status vocabulary', () => {
    expect(ProductInventoryStatusSchema.options).toEqual([
      'sellable',
      'uncollected',
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
        masterProductId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
      }],
    }).items[0]).toMatchObject({
      masterProductId: skuId,
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
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: null,
      abcEvaluation: null,
      abc: abcFixture,
      contribution: null,
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
      inventory: { skuCount: 0, measuredSkuCount: 0 },
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
        orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        traffic: { capturedAt: null, basis: uncoveredTrafficBasis },
        advertising: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      },
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
        contributionOverview: null,
        abcFormula: null,
        abcOfficialCutoffDate: '2026-07-31',
        displayDataAsOf: '2026-07-31',
        channelProductCounts: [{
          channelAccountId: '00000000-0000-4000-8000-000000000004',
          channel: 'coupang',
          channelAccountName: 'Coupang Wing',
          count: 71,
        }],
        inventoryStatusCounts: {
          sellable: 41,
          out_of_stock: 7,
          configuration_required: 19,
          review_required: 5,
          uncollected: 0,
        },
        negativeProfitCount: 6,
        imminentProductCount: 9,
        reorderProductCount: 12,
        depletionCoveredProductCount: 54,
      },
    });
    expect(response.summary.abcGradeCounts.A).toBe(23);
    expect(response.summary.abcGradeCounts.unclassified).toBe(0);
    expect(response.summary.channelProductCounts[0]?.count).toBe(71);
    expect(response.summary.inventoryStatusCounts.out_of_stock).toBe(7);
    expect(response.summary.negativeProfitCount).toBe(6);
    expect(response.summary.displayDataAsOf).toBe('2026-07-31');
    expect(response.items[0]?.abcGrade).toBeNull();
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
    expect(detail.channelListings[0]?.options[0]?.inventoryComponents[0]?.masterProductId).toBe(skuId);
    expect(detail.displayReference.value).toBe('13712531060');
  });

  it('rejects the retired duplicate available stock field in product detail', () => {
    const fixture = createProductDetailFixture();
    const listing = fixture.channelListings[0]!;
    const option = listing.options[0]!;
    const component = option.inventoryComponents[0]!;
    expect(() => MasterProductOperationsDetailSchema.parse({
      ...fixture,
      channelListings: [{
        ...listing,
        options: [{
          ...option,
          inventoryComponents: [{ ...component, availableStock: 64 }],
        }],
      }],
    })).toThrow(/availableStock/i);
  });

  it('rejects negative component availability in product detail', () => {
    expect(() => MasterProductOperationsDetailSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-001' },
      name: '키즈 식판',
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: null,
      abcEvaluation: null,
      abc: abcFixture,
      contribution: null,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      inventory: { skuCount: 1, measuredSkuCount: 1 },
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
            masterProductId: skuId,
            code: 'SP-001',
            name: '식판',
            optionName: null,
            barcode: null,
            currentStock: -1,
            quantity: 8,
          }],
        }],
      }],
    })).toThrow(/currentStock/i);
  });

  it('normalizes product codes in responses and enforces image-only mutation strictness', () => {
    expect(MasterProductOperationsMetadataSchema.parse({
      ...metadataFixture,
      code: '  KI-001  ',
      imageUrls: [],
      displayImageUrls: [],
    }).code).toBe('KI-001');
    expect(UpdateMasterProductInputSchema.parse({
      imageUrls: [' https://cdn.example.com/image.jpg '],
    })).toEqual({ imageUrls: ['https://cdn.example.com/image.jpg'] });
    expect(() => UpdateMasterProductInputSchema.parse({
      imageUrls: [],
      code: 'KI-001',
    })).toThrow();
    expect(() => UpdateMasterProductInputSchema.parse({})).toThrow();
  });

  it('accepts bounded direct channel option recipes with positive integer quantities', () => {
    expect(ReplaceChannelOptionInventoryInputSchema.parse({
      components: [{ masterProductId: skuId, quantity: 2 }],
    }).components).toHaveLength(1);
    expect(ReplaceChannelOptionInventoryInputSchema.parse({ components: [] }).components).toEqual([]);
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: [{ masterProductId: skuId, quantity: 0 }],
    })).toThrow();
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: Array.from({ length: 51 }, (_, index) => ({
        masterProductId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        quantity: 1,
      })),
    })).toThrow();
    expect(() => ReplaceChannelOptionInventoryInputSchema.parse({
      components: [
        { masterProductId: skuId, quantity: 1 },
        { masterProductId: skuId, quantity: 2 },
      ],
    })).toThrow();
  });
});
