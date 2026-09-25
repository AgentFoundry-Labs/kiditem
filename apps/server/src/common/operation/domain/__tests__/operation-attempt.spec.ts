import { describe, expect, it } from 'vitest';
import { decideFailure } from '../operation-attempt';
import { evaluateOperationFence, leaseExpiresAt } from '../operation-fence';

const NOW = new Date('2026-09-25T03:00:00.000Z');
const TOKEN = '7b0a3f7e-2f55-4f0e-9d3b-7a1c2e4b5d6f';

describe('operation failure disposition', () => {
  it('retries at now + retryAfterMs while attempts remain', () => {
    expect(decideFailure({ attempts: 1, maxAttempts: 3 }, 30_000, NOW)).toEqual({
      retry: true,
      scheduledFor: new Date('2026-09-25T03:00:30.000Z'),
    });
    expect(decideFailure({ attempts: 2, maxAttempts: 3 }, 0, NOW)).toEqual({ retry: true, scheduledFor: NOW });
  });

  it('is terminal on the last attempt or when the caller gave no retry delay', () => {
    expect(decideFailure({ attempts: 3, maxAttempts: 3 }, 30_000, NOW)).toEqual({ retry: false });
    expect(decideFailure({ attempts: 1, maxAttempts: 3 }, undefined, NOW)).toEqual({ retry: false });
    expect(decideFailure({ attempts: 1, maxAttempts: 1 }, 0, NOW)).toEqual({ retry: false });
  });
});

describe('operation lease per kind', () => {
  it('uses the kind lease when one is given', () => {
    expect(leaseExpiresAt(NOW, 60_000).toISOString()).toBe('2026-09-25T03:01:00.000Z');
  });
});

describe('operation fence on a prepared operation', () => {
  it('answers not found: a prepared operation has no issued token', () => {
    const prepared = { status: 'prepared' as const, token: TOKEN, expiresAt: NOW, errorCode: null, errorMessage: null };
    expect(evaluateOperationFence(prepared, TOKEN, NOW)).toEqual({ verdict: 'not_found' });
  });
});
