import { describe, expect, it } from 'vitest';
import {
  DashboardComparisonBasisSchema,
  DashboardAlertItemSchema,
  DashboardInventorySummarySchema,
  DashboardPeriodBasisSchema,
  DashboardProfitInputsSchema,
  DashboardSalesSummarySchema,
  DashboardSnapshotBasisSchema,
  TrafficKpiSchema,
  SellpiaProductInventoryResolutionSchema,
  SellpiaProductSalesIngestPayloadSchema,
  SellpiaSalesIngestPayloadSchema,
  SellpiaSalesSummarySchema,
  TopProductSchema,
} from './dashboard.js';

describe('dashboard schemas', () => {
  const completePeriodBasis = {
    kind: 'period' as const,
    from: '2026-09-01',
    to: '2026-09-03',
    targetDays: 3,
    includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    includedDays: 3,
    missingDates: [],
    invalidDates: [],
    sources: ['orders', 'coupang_ads'],
    status: 'complete' as const,
    partial: false,
    observedAt: '2026-09-04T01:00:00.000Z',
  };

  it('carries an exact period partition that preserves internal holes', () => {
    // Producers build this through `buildPeriodBasis`; the schema's job here
    // is the wire shape, and `dashboard-basis.spec.ts` owns the derivation.
    const partial = DashboardPeriodBasisSchema.parse({
      ...completePeriodBasis,
      includedDates: ['2026-09-01', '2026-09-03'],
      includedDays: 2,
      missingDates: ['2026-09-02'],
      invalidDates: [],
      status: 'partial',
      partial: true,
    });
    expect(partial.missingDates).toEqual(['2026-09-02']);
    expect(partial.includedDates).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('distinguishes a failed source query from an empty period', () => {
    const failed = DashboardPeriodBasisSchema.parse({
      ...completePeriodBasis,
      includedDates: [],
      includedDays: 0,
      missingDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      invalidDates: [],
      status: 'unverified',
      partial: false,
      queryFailedSources: ['coupang_ads'],
    });
    expect(failed.queryFailedSources).toEqual(['coupang_ads']);
    expect(DashboardPeriodBasisSchema.parse({
      ...completePeriodBasis,
      includedDates: [],
      includedDays: 0,
      missingDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      status: 'empty',
      partial: false,
    }).queryFailedSources).toBeUndefined();
  });

  it('distinguishes snapshot metadata from an unavailable period', () => {
    expect(DashboardSnapshotBasisSchema.parse({
      kind: 'snapshot',
      asOf: null,
      observedAt: null,
      sources: ['stored_abc_evaluation'],
      status: 'unknown',
      partial: false,
      withheldCount: 0,
    }).status).toBe('unknown');
  });

  it('round-trips a comparison that exposes both calculation bases', () => {
    const previous = {
      ...completePeriodBasis,
      from: '2026-08-29',
      to: '2026-08-31',
      includedDates: ['2026-08-29', '2026-08-30', '2026-08-31'],
    };
    const comparison = DashboardComparisonBasisSchema.parse({
      kind: 'comparison',
      current: completePeriodBasis,
      previous,
      matchedOffsets: [0, 1, 2],
      status: 'comparable',
      reason: null,
    });
    expect(comparison.matchedOffsets).toEqual([0, 1, 2]);
    expect(comparison.current.from).toBe('2026-09-01');
    expect(comparison.previous.from).toBe('2026-08-29');
    expect(DashboardComparisonBasisSchema.parse({
      kind: 'comparison',
      current: completePeriodBasis,
      previous,
      matchedOffsets: [],
      status: 'unavailable',
      reason: 'no shared valid dates',
    }).reason).toBe('no shared valid dates');
  });

  it('keeps numeric profit inputs tied to one common period basis', () => {
    const inputs = DashboardProfitInputsSchema.parse({
      revenue: 100_000,
      cost: 60_000,
      adCost: 10_000,
      qty: 4,
      basis: completePeriodBasis,
    });
    expect(inputs).toMatchObject({ revenue: 100_000, cost: 60_000, adCost: 10_000 });
    expect(inputs.basis.includedDates).toEqual(completePeriodBasis.includedDates);
    // Producers publish `null` instead of inputs over an empty basis, so the
    // response schema no longer re-asserts that relationship.
    expect(DashboardProfitInputsSchema.safeParse({
      ...inputs,
      qty: 'four',
    }).success).toBe(false);
  });

  const explicitEmptyProvenance = {
    source: 'sellpia_sale_summary' as const,
    mode: 'selldate' as const,
    sellerScope: 'all' as const,
    responseShape: 'empty_object' as const,
    explicitEmpty: true as const,
  };

  it('keeps unavailable traffic metrics nullable while preserving valid zeroes and provenance', () => {
    const parsed = TrafficKpiSchema.parse({
      visitors: 0,
      views: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      cartAdds: 0,
      conversionRate: null,
      dailyAverageVisitors: 0,
      providerConversionRate: 2.85,
      coverage: {
        from: '2026-09-01',
        to: '2026-09-03',
        targetDays: 3,
        completedDays: 3,
        missingDates: [],
      },
      reconciliation: {
        views: { status: 'UNVERIFIED', dailySum: 0, periodValue: null },
        cartAdds: { status: 'MATCHED', dailySum: 0, periodValue: 0 },
        orders: { status: 'MATCHED', dailySum: 0, periodValue: 0 },
        salesQty: { status: 'MATCHED', dailySum: 0, periodValue: 0 },
        revenue: { status: 'MISMATCH', dailySum: 0, periodValue: 1 },
      },
      exactPeriodEvidence: { source: 'wing-period-original' },
    });

    expect(parsed.dailyAverageVisitors).toBe(0);
    expect(parsed.revenue).toBe(0);
    expect(parsed.views).toBe(0);
    expect(parsed.exactPeriodEvidence).toEqual({ source: 'wing-period-original' });
    expect(TrafficKpiSchema.parse({
      ...parsed,
      visitors: null,
      views: null,
      orders: null,
      salesQty: null,
      revenue: null,
      cartAdds: null,
      dailyAverageVisitors: null,
      providerConversionRate: null,
      coverage: null,
      reconciliation: null,
      exactPeriodEvidence: null,
    }).revenue).toBeNull();
  });

  it('strips the retired Rocket monthly projection and rejects Rocket revenue sources', () => {
    const parsed = DashboardSalesSummarySchema.parse({
      today: { revenue: 0, orders: 0 },
      monthly: {
        revenue: 10_000,
        wingRevenue: 10_000,
        rocketRevenue: 99_000,
        profit: 1_000,
        adRate: 0,
        prevRevenue: 0,
        prevProfit: 0,
        revenueChange: 0,
        profitChange: 0,
        prevAdRate: 0,
        available: true,
        previousAvailable: false,
      },
      topProducts: [],
      monthlyTrend: [],
    });

    expect(parsed.monthly).not.toHaveProperty('rocketRevenue');
    expect(() => DashboardSalesSummarySchema.parse({
      ...parsed,
      effectivePeriod: {
        year: 2026,
        month: 7,
        label: '2026-07',
        shifted: false,
        latestDataDate: null,
        revenueSource: 'rocket',
      },
    })).toThrow();
  });

  it('requires matched Sellpia availability to equal physical current stock', () => {
    const resolution = {
      status: 'matched' as const,
      sellpiaInventorySkuId: '11111111-1111-4111-8111-111111111111',
      currentStock: 30,
      availableStock: 30,
      salesRowCount: 1,
      inventoryProduct: null,
      destinations: [],
    };

    expect(SellpiaProductInventoryResolutionSchema.parse(resolution)).toEqual(resolution);
    expect(() => SellpiaProductInventoryResolutionSchema.parse({
      ...resolution,
      availableStock: 29,
    })).toThrow(/availableStock/i);
  });

  it('uses stored profitability status, contribution profit, and formula context', () => {
    expect(DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 1 },
      abcStatusCount: {
        READY: 4,
        INSUFFICIENT_EVIDENCE: 1,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      },
      abcContributionProfit: {
        amountByGrade: { A: 200_000, B: 80_000, C: -20_000 },
        shareByGrade: { A: 0.77, B: 0.31, C: -0.08 },
      },
      abcFormula: null,
      classifiedProductCount: 4,
      unclassifiedProductCount: 1,
      mappingStatusCounts: { matched: 10, unmatched: 1, needsReview: 1 },
      alerts: [],
      warnings: {
        minusProducts: 0,
        lowProfitProducts: 0,
        highAdProducts: 0,
        outOfStockSkus: 4,
        mappingAttentionSkus: 2,
      },
    }).abcStatusCount.READY).toBe(4);
  });

  it('keeps inventory summary channel coverage counts', () => {
    const summary = DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 2 },
      abcStatusCount: {
        READY: 5,
        INSUFFICIENT_EVIDENCE: 0,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      },
      abcContributionProfit: {
        amountByGrade: { A: 250_000, B: 100_000, C: -20_000 },
        shareByGrade: { A: 0.76, B: 0.30, C: -0.06 },
      },
      abcFormula: null,
      classifiedProductCount: 5,
      unclassifiedProductCount: 0,
      mappingStatusCounts: { matched: 10, unmatched: 1, needsReview: 1 },
      alerts: [],
      warnings: {
        minusProducts: 0,
        lowProfitProducts: 0,
        highAdProducts: 0,
        outOfStockSkus: 4,
        mappingAttentionSkus: 2,
      },
    });

    expect(summary.channelLinkedProducts).toBe(3);
    expect(summary.channelUnlinkedProducts).toBe(2);
    expect(summary.classifiedProductCount).toBe(5);
    expect(summary.unclassifiedProductCount).toBe(0);
    expect(summary.warnings.outOfStockSkus).toBe(4);
    expect(summary.warnings.mappingAttentionSkus).toBe(2);
    expect(summary.warnings).not.toHaveProperty('needReorder');
  });

  it('parses dashboard operation alerts with deep links', () => {
    const summary = DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 2 },
      abcStatusCount: {
        READY: 5,
        INSUFFICIENT_EVIDENCE: 0,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      },
      abcContributionProfit: {
        amountByGrade: { A: 250_000, B: 100_000, C: -20_000 },
        shareByGrade: { A: 0.76, B: 0.30, C: -0.06 },
      },
      abcFormula: null,
      classifiedProductCount: 5,
      unclassifiedProductCount: 0,
      mappingStatusCounts: { matched: 10, unmatched: 0, needsReview: 0 },
      alerts: [{
        id: 'alert-1',
        kind: 'signal',
        status: 'RESOLVED',
        type: 'thumbnail_edit_job',
        severity: 'info',
        title: '썸네일 편집 완료',
        message: null,
        sourceType: 'thumbnail_generation',
        href: '/product-pipeline/thumbnail-ai?generationId=gen-1',
        progress: 1,
        targetType: null,
        targetId: null,
        isRead: false,
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:01:00.000Z',
      }],
      warnings: {
        minusProducts: 0,
        lowProfitProducts: 0,
        highAdProducts: 0,
        outOfStockSkus: 0,
        mappingAttentionSkus: 0,
      },
    });

    expect(summary.alerts[0].status).toBe('RESOLVED');
    expect(summary.alerts[0].href).toBe('/product-pipeline/thumbnail-ai?generationId=gen-1');
  });

  it('rejects retired ABC statuses and operation alert vocabulary', () => {
    expect(DashboardInventorySummarySchema.safeParse({
      totalProducts: 0,
      channelLinkedProducts: 0,
      channelUnlinkedProducts: 0,
      gradeCount: { A: 0, B: 0, C: 0 },
      abcStatusCount: {
        READY: 0,
        INSUFFICIENT_EVIDENCE: 0,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        CALIBRATION_PENDING: 0,
      },
      abcContributionProfit: {
        amountByGrade: { A: 0, B: 0, C: 0 },
        shareByGrade: { A: 0, B: 0, C: 0 },
      },
      abcFormula: null,
      classifiedProductCount: 0,
      unclassifiedProductCount: 0,
      mappingStatusCounts: { matched: 0, unmatched: 0, needsReview: 0 },
      alerts: [],
      warnings: {
        minusProducts: 0,
        lowProfitProducts: 0,
        highAdProducts: 0,
        outOfStockSkus: 0,
        mappingAttentionSkus: 0,
      },
    }).success).toBe(false);

    expect(DashboardAlertItemSchema.safeParse({
      id: 'alert-legacy',
      kind: 'operation',
      status: 'succeeded',
      type: 'thumbnail_edit_job',
      severity: 'info',
      title: 'legacy',
      message: null,
      isRead: false,
      createdAt: '2026-05-09T00:00:00.000Z',
    }).success).toBe(false);
  });

  it('keeps top-product stored ABC nullable and rejects non-ABC labels', () => {
    const base = {
      id: 'product-1',
      name: '상품',
      organization: '조직',
      revenue: 10_000,
      netProfit: 2_000,
      profitRate: 20,
    };

    expect(TopProductSchema.parse({ ...base, grade: null, abcEvaluation: null }).grade).toBeNull();
    expect(() => TopProductSchema.parse({ ...base, grade: 'manual', abcEvaluation: null })).toThrow();
  });

  it('lets a top product carry measured revenue and no profit', () => {
    // A Rocket purchase-order line has revenue and no listing to settle
    // against. The ranking used to publish `revenue * 0.3` for rows like this,
    // which the contract could not tell apart from a settled figure.
    const withheld = TopProductSchema.parse({
      id: 'line-sku:53889600',
      name: '로켓 공급 상품',
      organization: 'Coupang Rocket',
      grade: null,
      abcEvaluation: null,
      revenue: 1_474_200,
      netProfit: null,
      profitRate: null,
    });

    expect(withheld.revenue).toBe(1_474_200);
    expect(withheld.netProfit).toBeNull();
    expect(withheld.profitRate).toBeNull();
  });

  it('requires the Sellpia receipt profit after collected Coupang ad spend', () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
    const summary = SellpiaSalesSummarySchema.parse({
      range: { from: '2026-07-01', to: '2026-07-18' },
      rocket: emptyGroup,
      others: emptyGroup,
      totalRevenue: 1_000_000,
      totalCost: 600_000,
      adCost: 100_000,
      netProfit: 300_000,
      profitRate: 30,
      lastCapturedAt: '2026-07-18T00:00:00.000Z',
      hasData: true,
    });

    expect(summary.netProfit).toBe(300_000);
    expect(summary.adCost).toBe(100_000);
    expect(summary.profitRate).toBe(30);
  });

  it('accepts unavailable Sellpia advertising profit fields without relaxing sales fields', () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
    const summary = SellpiaSalesSummarySchema.parse({
      range: { from: '2026-07-01', to: '2026-07-18' },
      rocket: emptyGroup,
      others: {
        ...emptyGroup,
        revenue: 100_000,
        qty: 4,
        cost: 60_000,
      },
      totalRevenue: 100_000,
      totalCost: 60_000,
      adCost: null,
      netProfit: null,
      profitRate: null,
      lastCapturedAt: '2026-07-18T00:00:00.000Z',
      hasData: true,
    });

    expect(summary.totalRevenue).toBe(100_000);
    expect(summary.others.qty).toBe(4);
    expect(summary.adCost).toBeNull();
    expect(summary.netProfit).toBeNull();
    expect(summary.profitRate).toBeNull();
  });

  it('keeps an explicit zero-cost Sellpia result numeric', () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
    const summary = SellpiaSalesSummarySchema.parse({
      range: { from: '2026-07-01', to: '2026-07-18' },
      rocket: emptyGroup,
      others: emptyGroup,
      totalRevenue: 0,
      totalCost: 0,
      adCost: 0,
      netProfit: 0,
      profitRate: 0,
      lastCapturedAt: null,
      hasData: true,
    });

    expect(summary.adCost).toBe(0);
    expect(summary.netProfit).toBe(0);
    expect(summary.profitRate).toBe(0);
  });

  it('rejects malformed or oversized Sellpia collection ranges before ingest', () => {
    const capturedAt = '2026-07-18T00:00:00.000Z';
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range: { from: '2026-06-31', to: '2026-07-18' },
      sellers: [],
      provenance: explicitEmptyProvenance,
      capturedAt,
    }).success).toBe(false);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range: { from: '2026-07-18', to: '2026-07-17' },
      sellers: [],
      provenance: explicitEmptyProvenance,
      capturedAt,
    }).success).toBe(false);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range: { from: '2026-01-01', to: '2026-04-11' },
      sellers: [],
      provenance: explicitEmptyProvenance,
      capturedAt,
    }).success).toBe(false);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range: { from: '2026-07-18', to: '2026-07-18' },
      sellers: [],
      provenance: explicitEmptyProvenance,
    }).success).toBe(false);
  });

  it('requires source provenance for empty Sellpia results only', () => {
    const capturedAt = '2026-07-18T00:00:00.000Z';
    const range = { from: '2026-07-18', to: '2026-07-18' };

    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range,
      sellers: [],
      capturedAt,
    }).success).toBe(false);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range,
      sellers: [],
      provenance: explicitEmptyProvenance,
      capturedAt,
    }).success).toBe(true);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range,
      sellers: [{
        sellerId: '118',
        sellerName: '스마트스토어',
        days: [{ date: '2026-07-18', price: 0, amount: 0, buyPrice: 0 }],
      }],
      provenance: explicitEmptyProvenance,
      capturedAt,
    }).success).toBe(false);
    expect(SellpiaSalesIngestPayloadSchema.safeParse({
      range,
      sellers: [{ sellerId: '118', sellerName: '스마트스토어', days: [] }],
      capturedAt,
    }).success).toBe(false);
  });

  it('requires bounded integer monthly facts with explicit order-time-cost provenance', () => {
    const payload = {
      range: { from: '2026-06-01', to: '2026-06-30' },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{
        productCode: 'SKU-1',
        optionCode: '',
        productName: '상품',
        salePrice: 1_000,
        buyPrice: 400,
        months: [{
          yearMonth: '2026-06', orderQty: 0, orderAmount: 0, inQty: 0, inAmount: 0,
        }],
      }],
    };

    expect(SellpiaProductSalesIngestPayloadSchema.safeParse(payload).success).toBe(true);
    expect(SellpiaProductSalesIngestPayloadSchema.safeParse({
      ...payload,
      provenance: { ...payload.provenance, costBasis: 'CURRENT_BUY_PRICE' },
    }).success).toBe(false);
    expect(SellpiaProductSalesIngestPayloadSchema.safeParse({
      ...payload,
      products: [{ ...payload.products[0], months: [{
        ...payload.products[0].months[0], orderAmount: 1.5,
      }] }],
    }).success).toBe(false);
    expect(SellpiaProductSalesIngestPayloadSchema.safeParse({
      ...payload,
      products: Array.from({ length: 20_001 }, () => payload.products[0]),
    }).success).toBe(false);
  });
});
