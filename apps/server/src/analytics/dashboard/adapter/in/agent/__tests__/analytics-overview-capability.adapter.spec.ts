import { describe, expect, it, vi } from 'vitest';
import { AgentCapabilityRegistry } from '../../../../../../agent-os/application/service/agent-capability-registry.service';
import { AnalyticsOverviewCapabilityAdapter } from '../analytics-overview-capability.adapter';

describe('AnalyticsOverviewCapabilityAdapter', () => {
  it('publishes one bounded organization-scoped read capability', async () => {
    const registry = new AgentCapabilityRegistry();
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
      registry,
      context as never,
      sales as never,
      inventory as never,
    );
    adapter.onModuleInit();

    const handler = registry.resolve('analytics.readOverview');
    expect(handler).toMatchObject({
      sideEffects: ['read'],
      approvalRisk: 'none',
      ownerDomain: 'analytics',
    });
    const result = await handler!.execute({
      organizationId: 'org-1',
      agentInstanceId: 'session-1',
      agentType: 'operator',
      input: {},
    });

    expect(result).toEqual({
      resourceType: 'analytics_overview',
      outputSummary: {
        sales: { revenue: 120_000, orders: 8 },
        inventory: { outOfStockSkus: 3, mappingAttentionSkus: 2 },
        freshness: {
          lastSync: '2026-08-14T00:00:00.000Z',
          confirmedUntil: '2026-07-31',
        },
      },
    });
    expect(context.buildForQuery).toHaveBeenCalledWith('org-1', 'month');
    expect(sales.getSummary).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(inventory.getSummary).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

  it('accepts only today or month without leaking raw dashboard rows', async () => {
    const registry = new AgentCapabilityRegistry();
    const adapter = new AnalyticsOverviewCapabilityAdapter(
      registry,
      { buildForQuery: vi.fn() } as never,
      { getSummary: vi.fn() } as never,
      { getSummary: vi.fn() } as never,
    );
    adapter.onModuleInit();
    const handler = registry.resolve('analytics.readOverview')!;

    expect(handler.inputSchema.safeParse({ period: 'today' }).success).toBe(true);
    expect(handler.inputSchema.safeParse({ period: 'month' }).success).toBe(true);
    expect(handler.inputSchema.safeParse({ period: 'year' }).success).toBe(false);
    expect(handler.inputSchema.safeParse({ organizationId: 'forged' }).success).toBe(false);
    expect(Object.keys(handler.outputSchema.shape)).toEqual([
      'sales',
      'inventory',
      'freshness',
    ]);
  });
});
