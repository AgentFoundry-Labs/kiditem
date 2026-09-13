import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalCapabilityAdapter } from '../market-shadow-signal-capability.adapter';

describe('MarketShadowSignalCapabilityAdapter', () => {
  it('returns the same owner receipt without an Operation envelope', async () => {
    const receipt = { attemptId: 'attempt-1', state: 'FAILED', snapshot: null, errorCode: 'SOURCE_FAILED' };
    const service = { collect: vi.fn(async () => receipt) };
    const adapter = new MarketShadowSignalCapabilityAdapter(service as never);
    const input = { organizationId: 'org-1', requestedByUserId: 'user-1', idempotencyKey: 'owner-key' };
    expect(await adapter.collectShadowSignals(input)).toEqual(receipt);
    expect(service.collect).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('rejects a missing owner key before source admission', async () => {
    const service = { collect: vi.fn() };
    const adapter = new MarketShadowSignalCapabilityAdapter(service as never);
    await expect(adapter.collectShadowSignals({ organizationId: 'org-1' } as never)).rejects.toThrow('owner_idempotency_key_required');
    expect(service.collect).not.toHaveBeenCalled();
  });
});
