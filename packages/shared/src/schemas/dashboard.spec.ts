import { describe, expect, it } from 'vitest';
import {
  DashboardInventorySummarySchema,
  SellpiaProductSalesIngestPayloadSchema,
  SellpiaSalesIngestPayloadSchema,
  SellpiaSalesSummarySchema,
  TopProductSchema,
} from './dashboard.js';

describe('dashboard schemas', () => {
  const explicitEmptyProvenance = {
    source: 'sellpia_sale_summary' as const,
    mode: 'selldate' as const,
    sellerScope: 'all' as const,
    responseShape: 'empty_object' as const,
    explicitEmpty: true as const,
  };

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
        CALIBRATION_PENDING: 0,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
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
        CALIBRATION_PENDING: 0,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
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
        CALIBRATION_PENDING: 0,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
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
        kind: 'operation',
        status: 'succeeded',
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

    expect(summary.alerts[0].status).toBe('succeeded');
    expect(summary.alerts[0].href).toBe('/product-pipeline/thumbnail-ai?generationId=gen-1');
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
