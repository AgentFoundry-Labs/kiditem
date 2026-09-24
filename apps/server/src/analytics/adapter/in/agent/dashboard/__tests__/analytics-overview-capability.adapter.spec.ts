import { describe, expect, it, vi } from 'vitest';
import { AnalyticsOverviewCapabilityAdapter } from '../analytics-overview-capability.adapter';

describe('AnalyticsOverviewCapabilityAdapter', () => {
  it('publishes one bounded organization-scoped overview through the owner port', async () => {
    const sales = {
      getSummary: vi.fn().mockResolvedValue({
        monthly: { revenue: 120_000 },
        profitDetail: { orderCount: 8 },
        lastSyncAt: '2026-08-14T00:00:00.000Z',
      }),
    };
    const inventory = {
      getSummary: vi.fn().mockResolvedValue({
        warnings: { outOfStockSkus: 3, mappingAttentionSkus: 2 },
      }),
    };
    const adapter = new AnalyticsOverviewCapabilityAdapter(
      sales as never,
      inventory as never,
    );
    const result = await adapter.readOverview({
      organizationId: 'org-1',
      now: new Date('2026-08-14T00:00:00.000Z'),
    });

    expect(result).toEqual({
      sales: { revenue: 120_000, orders: 8 },
      inventory: { outOfStockSkus: 3, mappingAttentionSkus: 2 },
      // The only freshness fact any owner publishes is the sales observedAt.
      freshness: {
        lastSync: '2026-08-14T00:00:00.000Z',
      },
    });
    // An absent period selection reads the month, and both owners are asked
    // for the same organization-scoped context.
    expect(sales.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveRange: 'month',
        anchor: new Date('2026-08-14T00:00:00.000Z'),
      }),
      'org-1',
    );
    expect(inventory.getSummary).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

  it('reads the current KST business day for today and keeps unmeasured values null', async () => {
    const sales = {
      getSummary: vi.fn().mockResolvedValue({
        today: { revenue: null, orders: null, collectedOrders: null, missingDateCount: 0 },
        monthly: { revenue: 120_000 },
        profitDetail: { orderCount: 8 },
        lastSyncAt: null,
      }),
    };
    const inventory = {
      getSummary: vi.fn().mockResolvedValue({
        warnings: { outOfStockSkus: null, mappingAttentionSkus: 0 },
      }),
    };
    const adapter = new AnalyticsOverviewCapabilityAdapter(
      sales as never,
      inventory as never,
    );

    // 00:30 KST on 2026-08-14 is still 2026-08-13 in UTC.
    const result = await adapter.readOverview({
      organizationId: 'org-1',
      now: new Date('2026-08-13T15:30:00.000Z'),
      period: 'today',
    });

    // Unmeasured today sales stay unknown; the month's values are not substituted.
    expect(result).toEqual({
      sales: { revenue: null, orders: null },
      inventory: { outOfStockSkus: null, mappingAttentionSkus: 0 },
      freshness: { lastSync: null },
    });
    const [context] = sales.getSummary.mock.calls[0]!;
    expect(context).toMatchObject({
      effectiveRange: 'day',
      todayStart: new Date('2026-08-13T15:00:00.000Z'),
      dateRange: {
        start: new Date('2026-08-13T15:00:00.000Z'),
        end: new Date('2026-08-14T15:00:00.000Z'),
      },
    });
    expect(inventory.getSummary).toHaveBeenCalledWith(context, 'org-1');
  });

  it('keeps month revenue and order count null when the sales owner has not measured them', async () => {
    const sales = {
      getSummary: vi.fn().mockResolvedValue({
        today: { revenue: 5_000, orders: 2, collectedOrders: 2, missingDateCount: 0 },
        monthly: { revenue: null },
        profitDetail: null,
        lastSyncAt: '2026-08-14T00:00:00.000Z',
      }),
    };
    const inventory = {
      getSummary: vi.fn().mockResolvedValue({
        warnings: { outOfStockSkus: 0, mappingAttentionSkus: 0 },
      }),
    };
    const adapter = new AnalyticsOverviewCapabilityAdapter(
      sales as never,
      inventory as never,
    );

    const result = await adapter.readOverview({
      organizationId: 'org-1',
      now: new Date('2026-08-14T00:00:00.000Z'),
      period: 'month',
    });

    expect(result.sales).toEqual({ revenue: null, orders: null });
  });
});
