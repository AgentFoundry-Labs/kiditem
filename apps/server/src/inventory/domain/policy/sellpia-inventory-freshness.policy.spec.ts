import { describe, expect, it } from 'vitest';
import {
  deriveFreshnessStatus,
  planClaim,
  planOrderTransmissionFinalization,
  planRefreshRequest,
  toFreshnessView,
  toUnresolvedOrderTransmissionIntentList,
  type SellpiaInventoryFreshnessState,
} from './sellpia-inventory-freshness.policy';

const NOW = new Date('2026-07-15T00:00:00.000Z');
const UNRESOLVED_INTENT = {
  intentKey: '1721000000000-kidsnote-browser',
  preparedAt: new Date('2026-07-14T23:59:30.000Z'),
};

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

  it('keeps stock fresh when a separate transmission result is unresolved', () => {
    const state = makeState({
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
    });

    expect(deriveFreshnessStatus(state, NOW)).toBe('fresh');
  });

  it('lists unresolved transmissions without redefining freshness or claim state', () => {
    const state = makeState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
    });

    const view = toFreshnessView(state, NOW, null);
    const unresolved = toUnresolvedOrderTransmissionIntentList(state);

    expect(view.status).toBe('fresh');
    expect(unresolved).toEqual({
      items: [
      {
        intentKey: UNRESOLVED_INTENT.intentKey,
        preparedAt: '2026-07-14T23:59:30.000Z',
      },
      ],
      hasMore: false,
    });
  });

  it('reports an empty blocker list once every transmission is resolved', () => {
    const state = makeState({
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
    });
    const view = toFreshnessView(state, NOW, null);

    expect(view.status).toBe('fresh');
    expect(toUnresolvedOrderTransmissionIntentList(state)).toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('finalizes into a generation strictly after every generation visible at submit time', () => {
    const completedWhileTabWasOpen = makeState({
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      activeGeneration: null,
      unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
    });
    const patch = planOrderTransmissionFinalization(
      completedWhileTabWasOpen,
      new Date('2026-07-15T00:03:00.000Z'),
      '00000000-0000-4000-8000-000000000019',
    );

    expect(patch).toMatchObject({
      requestedGeneration: 5n,
      refreshReason: 'order_transmission_requested',
      refreshRequestedAt: new Date('2026-07-15T00:03:00.000Z'),
      syncNotBefore: new Date('2026-07-15T00:05:00.000Z'),
    });
  });

  it('starts a new settle window after the previous order generation was verified', () => {
    const patch = planOrderTransmissionFinalization(
      makeState({
        requestedGeneration: 4n,
        verifiedGeneration: 4n,
        refreshReason: 'order_transmission_requested',
        refreshRequestedAt: new Date('2026-07-14T23:50:00.000Z'),
        syncNotBefore: new Date('2026-07-14T23:55:00.000Z'),
        unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
      }),
      new Date('2026-07-15T00:03:00.000Z'),
      '00000000-0000-4000-8000-000000000020',
    );

    expect(patch).toMatchObject({
      requestedGeneration: 5n,
      refreshRequestedAt: new Date('2026-07-15T00:03:00.000Z'),
      syncNotBefore: new Date('2026-07-15T00:05:00.000Z'),
    });
  });

  it('coalesces only with an order generation that is still pending', () => {
    const patch = planOrderTransmissionFinalization(
      makeState({
        requestedGeneration: 4n,
        verifiedGeneration: 3n,
        refreshReason: 'order_transmission_requested',
        refreshRequestedAt: NOW,
        syncNotBefore: new Date('2026-07-15T00:04:30.000Z'),
        unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
      }),
      new Date('2026-07-15T00:04:00.000Z'),
      '00000000-0000-4000-8000-000000000021',
    );

    expect(patch).toMatchObject({
      requestedGeneration: 5n,
      refreshRequestedAt: NOW,
      syncNotBefore: new Date('2026-07-15T00:05:00.000Z'),
    });
  });

  it('starts a new settle window when the previous order generation failed', () => {
    const patch = planOrderTransmissionFinalization(
      makeState({
        requestedGeneration: 4n,
        verifiedGeneration: 3n,
        failedGeneration: 4n,
        refreshReason: 'order_transmission_requested',
        refreshRequestedAt: new Date('2026-07-14T23:50:00.000Z'),
        syncNotBefore: new Date('2026-07-14T23:55:00.000Z'),
        unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
      }),
      new Date('2026-07-15T00:03:00.000Z'),
      '00000000-0000-4000-8000-000000000022',
    );

    expect(patch).toMatchObject({
      requestedGeneration: 5n,
      refreshRequestedAt: new Date('2026-07-15T00:03:00.000Z'),
      syncNotBefore: new Date('2026-07-15T00:05:00.000Z'),
    });
  });

  it('starts a new settle window when the previous pending-order cap has expired', () => {
    const capBoundary = new Date('2026-07-15T00:05:00.000Z');
    const patch = planOrderTransmissionFinalization(
      makeState({
        requestedGeneration: 4n,
        verifiedGeneration: 3n,
        activeGeneration: 4n,
        activeSyncToken: '00000000-0000-4000-8000-000000000025',
        activeSyncOwnerUserId: '00000000-0000-4000-8000-000000000026',
        activeSyncStartedAt: NOW,
        activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
        refreshReason: 'order_transmission_requested',
        refreshRequestedAt: NOW,
        syncNotBefore: capBoundary,
        unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
      }),
      capBoundary,
      '00000000-0000-4000-8000-000000000027',
    );

    expect(patch).toMatchObject({
      requestedGeneration: 5n,
      refreshRequestedAt: capBoundary,
      syncNotBefore: new Date('2026-07-15T00:07:00.000Z'),
    });
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
      '00000000-0000-4000-8000-000000000023',
    );
    const second = planRefreshRequest(
      { ...makeState(), ...first },
      'order_transmission_requested',
      new Date('2026-07-15T00:04:30.000Z'),
      '00000000-0000-4000-8000-000000000024',
    );

    expect(second.requestedGeneration).toBe(2n);
    expect(second.refreshRequestedAt).toEqual(NOW);
    expect(second.syncNotBefore).toEqual(
      new Date('2026-07-15T00:05:00.000Z'),
    );
  });

  it('claims thirty settled order finalizations once at their high-water generation', () => {
    let state = makeState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    for (let index = 0; index < 30; index += 1) {
      state = {
        ...state,
        ...planOrderTransmissionFinalization(
          state,
          new Date(NOW.getTime() + index * 5_000),
          `order-fence-${index}`,
        ),
      };
    }

    expect(state).toMatchObject({
      requestedGeneration: 31n,
      verifiedGeneration: 1n,
      refreshRequestedAt: NOW,
      syncNotBefore: new Date('2026-07-15T00:04:25.000Z'),
    });
    const claim = planClaim(state, {
      now: new Date('2026-07-15T00:04:25.000Z'),
      userId: '00000000-0000-4000-8000-000000000081',
      claimToken: '00000000-0000-4000-8000-000000000082',
      freshnessFence: '00000000-0000-4000-8000-000000000083',
    });
    expect(claim).toMatchObject({ kind: 'claimed', generation: 31n });
    if (claim.kind !== 'claimed') return;

    const afterImport = makeState({
      ...state,
      ...claim.patch,
      requestedGeneration: 31n,
      verifiedGeneration: 31n,
      activeGeneration: null,
      activeSyncToken: null,
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: null,
      activeSyncLeaseExpiresAt: null,
      lastVerifiedAt: new Date('2026-07-15T00:04:30.000Z'),
      refreshRequestedAt: null,
      syncNotBefore: null,
    });
    expect(planClaim(afterImport, {
      now: new Date('2026-07-15T00:04:31.000Z'),
      userId: '00000000-0000-4000-8000-000000000081',
      claimToken: '00000000-0000-4000-8000-000000000084',
      freshnessFence: '00000000-0000-4000-8000-000000000085',
    })).toEqual({ kind: 'joined' });
  });

  it('runs one follow-up high-water claim for sends finalized during an active refresh', () => {
    const firstPatch = planOrderTransmissionFinalization(
      makeState({
        sourceAccountKey: 'kiditem',
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      }),
      NOW,
      '00000000-0000-4000-8000-000000000086',
    );
    let state = makeState({
      ...firstPatch,
      sourceAccountKey: 'kiditem',
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000087',
      activeSyncOwnerUserId: '00000000-0000-4000-8000-000000000088',
      activeSyncStartedAt: new Date('2026-07-15T00:02:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:03:30.000Z'),
    });
    for (let index = 0; index < 5; index += 1) {
      state = {
        ...state,
        ...planOrderTransmissionFinalization(
          state,
          new Date(Date.parse('2026-07-15T00:02:30.000Z') + index * 5_000),
          `follow-up-fence-${index}`,
        ),
      };
    }
    expect(state.requestedGeneration).toBe(7n);

    const afterActiveImport = {
      ...state,
      verifiedGeneration: 2n,
      activeGeneration: null,
      activeSyncToken: null,
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: null,
      activeSyncLeaseExpiresAt: null,
    };
    expect(planClaim(afterActiveImport, {
      now: new Date('2026-07-15T00:04:49.999Z'),
      userId: '00000000-0000-4000-8000-000000000089',
      claimToken: '00000000-0000-4000-8000-000000000090',
      freshnessFence: '00000000-0000-4000-8000-000000000091',
    })).toEqual({ kind: 'joined' });
    expect(planClaim(afterActiveImport, {
      now: new Date('2026-07-15T00:04:50.000Z'),
      userId: '00000000-0000-4000-8000-000000000089',
      claimToken: '00000000-0000-4000-8000-000000000092',
      freshnessFence: '00000000-0000-4000-8000-000000000093',
    })).toMatchObject({ kind: 'claimed', generation: 7n });
  });

  it('preserves a pending same-hash confirmation when another order coalesces before claim', () => {
    const confirmationRequestedAt = new Date('2026-07-15T00:01:00.000Z');
    const confirmationNotBefore = new Date('2026-07-15T00:04:00.000Z');
    const state = makeState({
      requestedGeneration: 3n,
      verifiedGeneration: 1n,
      refreshRequestedAt: confirmationRequestedAt,
      refreshReason: 'same_hash_confirmation',
      syncNotBefore: confirmationNotBefore,
    });

    const patch = planRefreshRequest(
      state,
      'order_transmission_requested',
      new Date('2026-07-15T00:02:00.000Z'),
      '00000000-0000-4000-8000-000000000022',
    );

    expect({ ...state, ...patch }).toMatchObject({
      requestedGeneration: 3n,
      refreshRequestedAt: confirmationRequestedAt,
      refreshReason: 'same_hash_confirmation',
      syncNotBefore: confirmationNotBefore,
    });
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

  it('claims a due generation while an order transmission intent is unresolved', () => {
    const state = makeState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      syncNotBefore: NOW,
      unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
    });

    expect(planClaim(state, {
      now: NOW,
      userId: '00000000-0000-4000-8000-000000000064',
      claimToken: '00000000-0000-4000-8000-000000000065',
      freshnessFence: '00000000-0000-4000-8000-000000000066',
    })).toMatchObject({ kind: 'claimed', generation: 2n });
  });

  it('blocks an ownerless future lease and fails it at exact expiry', () => {
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
      kind: 'expired',
      claimToken: orphanedLease.activeSyncToken,
      generation: 2n,
      createdBy: claimInput.userId,
      patch: {
        activeSyncToken: null,
        activeSyncOwnerUserId: null,
        activeGeneration: null,
        failedGeneration: 2n,
        lastAttemptStatus: 'failed',
        lastErrorCode: 'sellpia_background_timeout',
      },
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
    unresolvedOrderTransmissionIntents: [],
    ...overrides,
  };
}
