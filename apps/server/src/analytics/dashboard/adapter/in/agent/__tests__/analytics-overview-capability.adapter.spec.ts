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

});
