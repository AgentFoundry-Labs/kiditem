import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalCapabilityAdapter } from '../market-shadow-signal-capability.adapter';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';

describe('MarketShadowSignalCapabilityAdapter', () => {
  it('registers a guarded deterministic shadow operation capability without provider access', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T16:30:00.000Z'));
    const registered: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => registered.push(handler)),
    } as unknown as AgentCapabilityRegistry;
    const operations = {
      startShadowCollection: vi.fn(async () => ({
        operationRunId: 'run-1',
        status: 'queued',
      })),
    };
    const adapter = new MarketShadowSignalCapabilityAdapter(
      registry,
      operations as never,
    );

    adapter.onModuleInit();

    const handler = registered[0];
    expect(handler).toMatchObject({
      key: 'market.collect_shadow_signals',
      executionKind: 'job_trigger',
      sideEffects: ['db_write', 'external_io', 'job_enqueue'],
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

    expect(operations.startShadowCollection).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestedByUserId: null,
      triggerSource: 'agent',
      idempotencyKey: 'org-1:market.collect_shadow_signals:2026-07-16',
    });
    expect(result.outputSummary).toEqual({
      operationRunId: 'run-1',
      status: 'queued',
    });
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({
      artifactType: 'operation_run',
      targetDomain: 'operations',
      targetModel: 'OperationRun',
      targetId: 'run-1',
      summary: { operationRunId: 'run-1', status: 'queued' },
    }));
    vi.useRealTimers();
  });
});
