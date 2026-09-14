import { describe, expect, it } from 'vitest';
import {
  deriveFreshnessStatus,
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
    expect(toFreshnessView(state, NOW, null, null)).toMatchObject({
      status: 'failed',
      activeSync: null,
      lastAttempt: {
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

  describe('last attempt facts', () => {
    const ATTEMPTED_AT = new Date('2026-07-14T23:50:00.000Z');

    it('publishes no last attempt before one ended', () => {
      expect(toFreshnessView(makeState({ lastAttemptAt: null }), NOW, null, null).lastAttempt)
        .toBeNull();
    });

    it('publishes the last attempt facts without an outcome word', () => {
      const state = makeState({
        lastAttemptAt: ATTEMPTED_AT,
        lastAttemptSyncScope: 'full',
        refreshReason: 'retry',
        lastErrorCode: 'sellpia_login_required',
        lastErrorMessage: 'Sellpia login required.',
      });

      expect(toFreshnessView(state, NOW, null, null).lastAttempt).toEqual({
        attemptedAt: ATTEMPTED_AT.toISOString(),
        trigger: 'retry',
        scope: 'full',
        errorCode: 'sellpia_login_required',
        errorMessage: 'Sellpia login required.',
      });
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
