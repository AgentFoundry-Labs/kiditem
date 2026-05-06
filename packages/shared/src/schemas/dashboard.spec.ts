import { describe, expect, it } from 'vitest';
import { DashboardInventorySummarySchema } from './dashboard.js';

describe('dashboard schemas', () => {
  it('keeps inventory summary channel coverage counts', () => {
    const summary = DashboardInventorySummarySchema.parse({
      totalProducts: 5,
      channelLinkedProducts: 3,
      channelUnlinkedProducts: 2,
      gradeCount: { A: 1, B: 2, C: 2 },
      alerts: [],
      warnings: {
        minusProducts: 0,
        lowProfitProducts: 0,
        highAdProducts: 0,
        needReorder: 0,
      },
    });

    expect(summary.channelLinkedProducts).toBe(3);
    expect(summary.channelUnlinkedProducts).toBe(2);
  });
});
