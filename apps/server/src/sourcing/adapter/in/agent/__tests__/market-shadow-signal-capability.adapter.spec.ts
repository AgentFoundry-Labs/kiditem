import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalCapabilityAdapter } from '../market-shadow-signal-capability.adapter';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';

describe('MarketShadowSignalCapabilityAdapter', () => {
  it('registers a guarded deterministic shadow collection capability', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T16:30:00.000Z'));
    const registered: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => registered.push(handler)),
    } as unknown as AgentCapabilityRegistry;
    const service = {
      collect: vi.fn(async () => ({
        claimed: true,
        snapshot: {
          id: 'snapshot-1',
          organizationId: 'org-1',
          businessDate: new Date('2026-07-16T00:00:00.000Z'),
          payload: {
            result: {
              status: 'complete',
              decisionImpact: 'disabled',
              evaluation: { googleTrends: { signalCount: 1 } },
              errors: [],
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })),
    };
    const adapter = new MarketShadowSignalCapabilityAdapter(
      registry,
      service as never,
    );

    adapter.onModuleInit();

    const handler = registered[0];
    expect(handler).toMatchObject({
      key: 'market.collect_shadow_signals',
      executionKind: 'job_trigger',
      sideEffects: ['read', 'external_io', 'db_write'],
      approvalRisk: 'low',
    });
    expect(handler.idempotencyKey({
      organizationId: 'org-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      input: {},
    })).toBe('org-1:market.collect_shadow_signals:2026-07-16');

    const result = await handler.execute({
      organizationId: 'org-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      input: {},
    });

    expect(service.collect).toHaveBeenCalledWith('org-1');
    expect(result.outputSummary).toEqual({
      claimed: true,
      snapshotId: 'snapshot-1',
      businessDate: '2026-07-16',
      status: 'complete',
      decisionImpact: 'disabled',
    });
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({
      targetId: 'snapshot-1',
      summary: expect.objectContaining({
        decisionImpact: 'disabled',
        evaluation: { googleTrends: { signalCount: 1 } },
      }),
    }));
    vi.useRealTimers();
  });
});
