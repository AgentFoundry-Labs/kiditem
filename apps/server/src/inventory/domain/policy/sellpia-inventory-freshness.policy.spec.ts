import { describe, expect, it } from 'vitest';
import {
  deriveFreshnessStatus,
  deriveLastAttemptStatus,
  planRefreshRequest,
  toFreshnessView,
  type SellpiaInventoryFreshnessState,
} from './sellpia-inventory-freshness.policy';

const NOW = new Date('2026-07-15T00:00:00.000Z');
describe('Sellpia inventory freshness policy', () => {
  it('prioritizes a live lease over a failed requested generation', () => {
    const state = makeState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      failedGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000010',
      activeSyncOwnerUserId: '00000000-0000-4000-8000-000000000011',
      activeSyncStartedAt: NOW,
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
      activeGeneration: 2n,
    });

    expect(deriveFreshnessStatus(state, NOW)).toBe('syncing');
  });

  it('prioritizes the current failed generation over a pending refresh', () => {
    expect(deriveFreshnessStatus(makeState({
      requestedGeneration: 3n,
      verifiedGeneration: 2n,
      failedGeneration: 3n,
    }), NOW)).toBe('failed');
  });

  it('treats an expired current owner attempt as failed without mutating state', () => {
    const state = makeState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000020',
      activeSyncStartedAt: new Date('2026-07-14T23:55:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-14T23:59:00.000Z'),
      lastAttemptAt: new Date('2026-07-14T23:50:00.000Z'),
    });

    expect(deriveFreshnessStatus(state, NOW)).toBe('failed');
    expect(toFreshnessView(state, NOW, null)).toMatchObject({
      status: 'failed',
      activeSync: null,
      lastAttempt: {
        status: 'failed',
        errorCode: null,
        errorMessage: 'Sellpia inventory collection attempt expired.',
      },
    });
    expect(state.failedGeneration).toBeNull();
  });

  it('keeps a requested generation refresh-required when no attempt is active', () => {
    expect(deriveFreshnessStatus(makeState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: null,
      activeSyncLeaseExpiresAt: new Date('2026-07-14T23:59:00.000Z'),
    }), NOW)).toBe('refresh_required');
  });

  it('is fresh before ten minutes and stale at exactly ten minutes', () => {
    expect(deriveFreshnessStatus(makeState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.001Z'),
    }), NOW)).toBe('fresh');
    expect(deriveFreshnessStatus(makeState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    }), NOW)).toBe('refresh_required');
  });

  it('creates only one follow-up generation while a generation is active', () => {
    const active = makeState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000030',
      activeSyncOwnerUserId: '00000000-0000-4000-8000-000000000031',
      activeSyncStartedAt: NOW,
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
    const first = planRefreshRequest(
      active,
      'manual_request',
      'inventory',
      NOW,
      '00000000-0000-4000-8000-000000000032',
    );
    const joined = planRefreshRequest(
      { ...active, ...first },
      'manual_request',
      'inventory',
      NOW,
      '00000000-0000-4000-8000-000000000033',
    );

    expect(first.requestedGeneration).toBe(3n);
    expect(joined.requestedGeneration).toBe(3n);
  });

  it('creates a new generation when retrying the current failed generation', () => {
    const retry = planRefreshRequest(
      makeState({
        requestedGeneration: 2n,
        verifiedGeneration: 1n,
        failedGeneration: 2n,
      }),
      'retry',
      'inventory',
      NOW,
      '00000000-0000-4000-8000-000000000040',
    );

    expect(retry).toMatchObject({
      requestedGeneration: 3n,
      refreshReason: 'retry',
      failedGeneration: 2n,
    });
  });

  describe('last attempt outcome', () => {
    const VERIFIED_AT = new Date('2026-07-14T23:40:00.000Z');
    const FAILED_AT = new Date('2026-07-14T23:50:00.000Z');

    it('has no outcome before an attempt ended', () => {
      const state = makeState({ lastAttemptAt: null });
      expect(deriveLastAttemptStatus(state)).toBeNull();
      expect(toFreshnessView(state, NOW, null).lastAttempt).toBeNull();
    });

    it('is completed when the attempt ended at its own verification', () => {
      const state = makeState({ lastVerifiedAt: VERIFIED_AT, lastAttemptAt: VERIFIED_AT });
      expect(deriveLastAttemptStatus(state)).toBe('completed');
      expect(toFreshnessView(state, NOW, null).lastAttempt).toMatchObject({
        attemptedAt: VERIFIED_AT.toISOString(),
        status: 'completed',
      });
    });

    it('is failed when the attempt ended after the last verification, or nothing was verified', () => {
      expect(deriveLastAttemptStatus(makeState({
        lastVerifiedAt: VERIFIED_AT,
        lastAttemptAt: FAILED_AT,
      }))).toBe('failed');
      expect(deriveLastAttemptStatus(makeState({
        lastVerifiedAt: null,
        verifiedGeneration: 0n,
        lastAttemptAt: FAILED_AT,
      }))).toBe('failed');
    });

    it('keeps a failure as the last attempt after the next begin clears the failed generation and error code', () => {
      const state = makeState({
        lastVerifiedAt: VERIFIED_AT,
        lastAttemptAt: FAILED_AT,
        failedGeneration: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        requestedGeneration: 3n,
        activeGeneration: 3n,
        activeSyncToken: '00000000-0000-4000-8000-000000000050',
        activeSyncOwnerUserId: '00000000-0000-4000-8000-000000000051',
        activeSyncStartedAt: NOW,
        activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
      });

      expect(deriveLastAttemptStatus(state)).toBe('failed');
      expect(toFreshnessView(state, NOW, null)).toMatchObject({
        status: 'syncing',
        lastAttempt: {
          attemptedAt: FAILED_AT.toISOString(),
          status: 'failed',
          errorCode: null,
        },
      });
    });

    it('reads a recorded failed generation as failed even when the attempt time does not pass the verification', () => {
      expect(deriveLastAttemptStatus(makeState({
        lastVerifiedAt: VERIFIED_AT,
        lastAttemptAt: new Date('2026-07-14T23:30:00.000Z'),
        failedGeneration: 2n,
      }))).toBe('failed');
    });
  });
});

function makeState(
  overrides: Partial<SellpiaInventoryFreshnessState> = {},
): SellpiaInventoryFreshnessState {
  return {
    organizationId: '00000000-0000-4000-8000-000000000001',
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    lastCompletedImportRunId: null,
    refreshRequestedAt: null,
    refreshReason: 'legacy_manual_import',
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeSyncScope: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 1n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptSyncScope: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: '00000000-0000-4000-8000-000000000002',
    ...overrides,
  };
}
