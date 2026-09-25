import { describe, expect, it } from 'vitest';
import { evaluateOperationFence, isLeaseExpired, leaseExpiresAt } from '../operation-fence';

const NOW = new Date('2026-09-25T03:00:00.000Z');
const TOKEN = '7b0a3f7e-2f55-4f0e-9d3b-7a1c2e4b5d6f';
const OTHER_TOKEN = '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

function executing(overrides: Partial<Parameters<typeof evaluateOperationFence>[0]> = {}) {
  return {
    status: 'executing' as const,
    token: TOKEN,
    expiresAt: new Date('2026-09-25T03:10:00.000Z'),
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('operation lease', () => {
  it('runs thirty minutes from the fenced write', () => {
    expect(leaseExpiresAt(NOW).toISOString()).toBe('2026-09-25T03:30:00.000Z');
  });

  it('is expired at the exact expiry instant, not a millisecond before', () => {
    expect(isLeaseExpired(new Date('2026-09-25T03:00:00.000Z'), NOW)).toBe(true);
    expect(isLeaseExpired(new Date('2026-09-25T03:00:00.001Z'), NOW)).toBe(false);
  });
});

describe('operation fence', () => {
  it('admits the holder of the token while the lease is live', () => {
    expect(evaluateOperationFence(executing(), TOKEN, NOW)).toEqual({ verdict: 'admit' });
  });

  it('answers not found for a wrong or malformed token so the token is never confirmed', () => {
    expect(evaluateOperationFence(executing(), OTHER_TOKEN, NOW)).toEqual({ verdict: 'not_found' });
    expect(evaluateOperationFence(executing(), 'not-a-uuid', NOW)).toEqual({ verdict: 'not_found' });
    expect(evaluateOperationFence(executing(), undefined, NOW)).toEqual({ verdict: 'not_found' });
  });

  it('refuses an executing operation whose lease ran out and asks for it to be closed', () => {
    expect(evaluateOperationFence(executing({ expiresAt: NOW }), TOKEN, NOW)).toEqual({ verdict: 'reject', reason: 'expired', expire: true });
  });

  it('refuses a finished operation as terminal', () => {
    for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
      expect(evaluateOperationFence(executing({ status }), TOKEN, NOW)).toEqual({ verdict: 'reject', reason: 'terminal', expire: false });
    }
  });

  it('keeps answering expired for an operation that was closed by its lease running out', () => {
    const closed = executing({ status: 'failed', errorCode: 'OPERATION_FENCE_LOST', errorMessage: 'expired', expiresAt: NOW });
    expect(evaluateOperationFence(closed, TOKEN, NOW)).toEqual({ verdict: 'reject', reason: 'expired', expire: false });
  });
});
