import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalCapabilityAdapter } from '../market-shadow-signal-capability.adapter';

describe('MarketShadowSignalCapabilityAdapter', () => {
  it('starts a durable shadow collection Operation through the Sourcing owner port', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T16:30:00.000Z'));
    const operations = {
      startShadowCollection: vi.fn(async () => ({
        operationRunId: 'run-1',
        status: 'queued',
      })),
    };
    const adapter = new MarketShadowSignalCapabilityAdapter(
      operations as never,
    );
    const result = await adapter.collectShadowSignals({ organizationId: '00000000-0000-4000-8000-000000000001' });

    expect(operations.startShadowCollection).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: null,
      triggerSource: 'agent',
      idempotencyKey: '00000000-0000-4000-8000-000000000001:sourcing.collect_shadow_signals:2026-07-16',
    });
    expect(result).toEqual({
      operationRunId: 'run-1',
      status: 'queued',
    });
    vi.useRealTimers();
  });
});
