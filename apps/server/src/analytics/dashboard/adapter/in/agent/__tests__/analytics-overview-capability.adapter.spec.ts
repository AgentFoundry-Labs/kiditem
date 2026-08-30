import { describe, expect, it, vi } from 'vitest';
import { AnalyticsOverviewCapabilityAdapter } from '../analytics-overview-capability.adapter';

describe('AnalyticsOverviewCapabilityAdapter', () => {
  it('publishes one bounded organization-scoped overview through the owner port', async () => {
    const context = {
      buildForQuery: vi.fn().mockResolvedValue({ now: new Date('2026-08-14T00:00:00.000Z') }),
    };
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
        dataFreshness: {
          lastSync: '2026-08-14T00:00:00.000Z',
          confirmedUntil: '2026-07-31',
        },
      }),
    };
    const adapter = new AnalyticsOverviewCapabilityAdapter(
      context as never,
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
      freshness: {
        lastSync: '2026-08-14T00:00:00.000Z',
        confirmedUntil: '2026-07-31',
      },
    });
    expect(context.buildForQuery).toHaveBeenCalledWith('org-1', 'month');
    expect(sales.getSummary).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(inventory.getSummary).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

});
