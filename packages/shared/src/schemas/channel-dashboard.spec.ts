import { describe, expect, it } from 'vitest';
import { ChannelDashboardSummarySchema } from './channel-dashboard.js';

const base = {
  pendingAccept: 0,
  pendingReturns: 0,
  lastModifiedAt: null,
};

describe('ChannelDashboardSummarySchema', () => {
  it('accepts an unmeasured today card as a null pair', () => {
    expect(ChannelDashboardSummarySchema.parse({
      ...base,
      todayOrders: { count: null, revenue: null },
    }).todayOrders).toEqual({ count: null, revenue: null });
  });

  it('rejects partially measured today values', () => {
    expect(() => ChannelDashboardSummarySchema.parse({
      ...base,
      todayOrders: { count: 0, revenue: null },
    })).toThrow();
  });
});
