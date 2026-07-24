import { describe, expect, it } from 'vitest';
import {
  DashboardInventorySummarySchema,
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
  it('keeps inventory summary channel coverage counts', () => {
    const summary = DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 2 },
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

    expect(TopProductSchema.parse({ ...base, grade: null }).grade).toBeNull();
    expect(() => TopProductSchema.parse({ ...base, grade: 'manual' })).toThrow();
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
});
