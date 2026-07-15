import { describe, expect, it } from 'vitest';
import {
  deriveFreshnessStatus,
  planClaim,
  planRefreshRequest,
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

  it('is fresh before ten minutes and stale at exactly ten minutes', () => {
    expect(deriveFreshnessStatus(makeState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.001Z'),
    }), NOW)).toBe('fresh');
    expect(deriveFreshnessStatus(makeState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    }), NOW)).toBe('refresh_required');
  });

  it('coalesces order transmissions and caps syncNotBefore at five minutes', () => {
    const first = planRefreshRequest(
      makeState({
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      }),
      'order_transmission_requested',
      NOW,
      '00000000-0000-4000-8000-000000000020',
    );
    const second = planRefreshRequest(
      { ...makeState(), ...first },
      'order_transmission_requested',
      new Date('2026-07-15T00:04:30.000Z'),
      '00000000-0000-4000-8000-000000000021',
    );

    expect(second.requestedGeneration).toBe(2n);
    expect(second.refreshRequestedAt).toEqual(NOW);
    expect(second.syncNotBefore).toEqual(
      new Date('2026-07-15T00:05:00.000Z'),
    );
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
      NOW,
      '00000000-0000-4000-8000-000000000032',
    );
    const joined = planRefreshRequest(
      { ...active, ...first },
      'manual_request',
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
      NOW,
      '00000000-0000-4000-8000-000000000040',
    );

    expect(retry).toMatchObject({
      requestedGeneration: 3n,
      refreshReason: 'retry',
      failedGeneration: 2n,
    });
  });

  it('creates and claims one ttl_expired generation at the exact TTL boundary', () => {
    const decision = planClaim(
      makeState({
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
      }),
      {
        now: NOW,
        userId: '00000000-0000-4000-8000-000000000051',
        claimToken: '00000000-0000-4000-8000-000000000052',
        freshnessFence: '00000000-0000-4000-8000-000000000053',
      },
    );

    expect(decision.kind).toBe('claimed');
    if (decision.kind !== 'claimed') return;
    expect(decision.patch).toMatchObject({
      requestedGeneration: 2n,
      activeGeneration: 2n,
      refreshReason: 'ttl_expired',
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
  });

  it('does not claim before syncNotBefore or without confirmed source binding', () => {
    const dueLater = makeState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      syncNotBefore: new Date('2026-07-15T00:00:00.001Z'),
    });
    const claimInput = {
      now: NOW,
      userId: '00000000-0000-4000-8000-000000000061',
      claimToken: '00000000-0000-4000-8000-000000000062',
      freshnessFence: '00000000-0000-4000-8000-000000000063',
    };

    expect(planClaim(dueLater, claimInput)).toEqual({ kind: 'joined' });
    expect(planClaim(
      { ...dueLater, sourceAccountKey: null, syncNotBefore: NOW },
      claimInput,
    )).toEqual({ kind: 'joined' });
  });

  it('blocks an ownerless future lease and reclaims it at exact expiry', () => {
    const orphanedLease = makeState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000070',
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: NOW,
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
    const claimInput = {
      now: NOW,
      userId: '00000000-0000-4000-8000-000000000071',
      claimToken: '00000000-0000-4000-8000-000000000072',
      freshnessFence: '00000000-0000-4000-8000-000000000073',
    };

    expect(planClaim(orphanedLease, claimInput)).toEqual({ kind: 'joined' });
    expect(planClaim(orphanedLease, {
      ...claimInput,
      now: new Date('2026-07-15T00:01:30.000Z'),
    })).toMatchObject({
      kind: 'claimed',
      generation: 2n,
      patch: { activeSyncOwnerUserId: claimInput.userId },
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
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 1n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: '00000000-0000-4000-8000-000000000002',
    ...overrides,
  };
}
