import { describe, expect, it } from 'vitest';
import { DashboardInventorySummarySchema } from './dashboard.js';

describe('dashboard schemas', () => {
  it('keeps inventory summary channel coverage counts', () => {
    const summary = DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 2 },
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
});
