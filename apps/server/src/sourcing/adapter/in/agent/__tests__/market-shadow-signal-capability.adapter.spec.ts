import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalCapabilityAdapter } from '../market-shadow-signal-capability.adapter';

describe('MarketShadowSignalCapabilityAdapter', () => {
  it('starts a durable shadow collection Operation through the Sourcing owner port', async () => {
    const operations = {
      startShadowCollection: vi.fn(async () => ({
        operationRunId: 'run-1',
        status: 'queued',
      })),
    };
    const adapter = new MarketShadowSignalCapabilityAdapter(
      operations as never,
    );
    const result = await adapter.collectShadowSignals({ organizationId: '00000000-0000-4000-8000-000000000001', idempotencyKey: 'owner-key' });

    expect(operations.startShadowCollection).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: null,
      triggerSource: 'agent',
      idempotencyKey: 'owner-key',
    });
    expect(result).toEqual({
      operationRunId: 'run-1',
      status: 'queued',
    });
  });

  it('rejects a missing owner idempotency key before enqueueing', async () => {
    const operations = { startShadowCollection: vi.fn() };
    const adapter = new MarketShadowSignalCapabilityAdapter(operations as never);
    await expect(adapter.collectShadowSignals({ organizationId: '00000000-0000-4000-8000-000000000001' } as never)).rejects.toThrow('owner_idempotency_key_required');
    expect(operations.startShadowCollection).not.toHaveBeenCalled();
  });
});
