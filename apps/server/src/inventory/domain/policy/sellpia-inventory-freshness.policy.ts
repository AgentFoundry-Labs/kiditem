import {
  deriveSellpiaInventoryFreshness,
  type SellpiaInventoryCollectionFailureCode,
  type SellpiaInventoryFreshnessStatus,
  type SellpiaInventoryFreshnessView,
  type SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_SOURCE_ACCOUNT_KEY = 'kiditem' as const;
export const SELLPIA_FRESHNESS_TTL_MS = 10 * 60_000;
export const SELLPIA_CLAIM_LEASE_MS = 90_000;
export const SELLPIA_ORDER_SETTLE_MS = 2 * 60_000;
export const SELLPIA_ORDER_SETTLE_CAP_MS = 5 * 60_000;

export type SellpiaInventoryFreshnessState = {
  organizationId: string;
  sourceOrigin: string;
  sourceAccountKey: string | null;
  lastVerifiedAt: Date | null;
  lastCompletedImportRunId: string | null;
  refreshRequestedAt: Date | null;
  refreshReason: SellpiaInventoryRefreshReason | null;
  syncNotBefore: Date | null;
  activeSyncToken: string | null;
  activeSyncOwnerUserId: string | null;
  activeSyncStartedAt: Date | null;
  activeSyncLeaseExpiresAt: Date | null;
  requestedGeneration: bigint;
  activeGeneration: bigint | null;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  lastAttemptAt: Date | null;
  lastAttemptStatus: 'completed' | 'failed' | null;
  lastErrorCode: SellpiaInventoryCollectionFailureCode | null;
  lastErrorMessage: string | null;
  freshnessFence: string;
  unresolvedOrderTransmissionIntentCount: number;
};

export type SellpiaInventoryFreshnessStatePatch = Partial<
  Omit<SellpiaInventoryFreshnessState, 'organizationId'>
>;

export type SellpiaClaimDecision =
  | { kind: 'joined' }
  | {
    kind: 'claimed';
    patch: SellpiaInventoryFreshnessStatePatch;
    generation: bigint;
    leaseExpiresAt: Date;
  };

export function createInitialFreshnessState(input: {
  organizationId: string;
  now: Date;
  freshnessFence: string;
}): SellpiaInventoryFreshnessState {
  return {
    organizationId: input.organizationId,
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: null,
    lastVerifiedAt: null,
    lastCompletedImportRunId: null,
    refreshRequestedAt: input.now,
    refreshReason: 'initial_snapshot',
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 0n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: input.freshnessFence,
    unresolvedOrderTransmissionIntentCount: 0,
  };
}

export function deriveFreshnessStatus(
  state: SellpiaInventoryFreshnessState,
  now: Date,
): SellpiaInventoryFreshnessStatus {
  return deriveSellpiaInventoryFreshness({
    now,
    lastVerifiedAt: state.lastVerifiedAt,
    requestedGeneration: state.requestedGeneration,
    verifiedGeneration: state.verifiedGeneration,
    failedGeneration: state.failedGeneration,
    activeSyncLeaseExpiresAt: state.activeSyncLeaseExpiresAt,
    hasUnresolvedOrderTransmissionIntent:
      state.unresolvedOrderTransmissionIntentCount > 0,
  });
}

export function toFreshnessView(
  state: SellpiaInventoryFreshnessState,
  now: Date,
  userId: string | null,
): SellpiaInventoryFreshnessView {
  const activeSync = hasLiveLease(state, now)
    && state.activeSyncToken
    && state.activeGeneration !== null
    && state.activeSyncStartedAt
    && state.activeSyncLeaseExpiresAt
    ? {
      runId: state.activeSyncToken,
      generation: state.activeGeneration.toString(),
      startedAt: state.activeSyncStartedAt.toISOString(),
      leaseExpiresAt: state.activeSyncLeaseExpiresAt.toISOString(),
      canControl: userId !== null && state.activeSyncOwnerUserId === userId,
    }
    : null;
  const lastAttempt = state.lastAttemptAt && state.lastAttemptStatus
    ? {
      attemptedAt: state.lastAttemptAt.toISOString(),
      status: state.lastAttemptStatus,
      trigger: state.refreshReason,
      errorCode: state.lastErrorCode,
      errorMessage: state.lastErrorMessage,
    }
    : null;

  return {
    status: deriveFreshnessStatus(state, now),
    sourceBinding: isSourceBindingConfirmed(state)
      ? {
        origin: SELLPIA_SOURCE_ORIGIN,
        accountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
        confirmed: true,
      }
      : {
        origin: SELLPIA_SOURCE_ORIGIN,
        accountKey: null,
        confirmed: false,
      },
    lastVerifiedAt: state.lastVerifiedAt?.toISOString() ?? null,
    expiresAt: state.lastVerifiedAt
      ? new Date(state.lastVerifiedAt.getTime() + SELLPIA_FRESHNESS_TTL_MS).toISOString()
      : null,
    requestedGeneration: state.requestedGeneration.toString(),
    verifiedGeneration: state.verifiedGeneration.toString(),
    refreshRequestedAt: state.refreshRequestedAt?.toISOString() ?? null,
    refreshReason: state.refreshReason,
    syncNotBefore: state.syncNotBefore?.toISOString() ?? null,
    activeSync,
    lastAttempt,
  };
}

export function planSourceBindingConfirmation(
  state: SellpiaInventoryFreshnessState,
  freshnessFence: string,
): SellpiaInventoryFreshnessStatePatch {
  return {
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
    freshnessFence,
  };
}

export function planRefreshRequest(
  state: SellpiaInventoryFreshnessState,
  reason: SellpiaInventoryRefreshReason,
  now: Date,
  freshnessFence: string,
): SellpiaInventoryFreshnessStatePatch {
  const liveGeneration = hasLiveLease(state, now)
    ? state.activeGeneration
    : null;
  const retryingCurrentFailure = reason === 'retry'
    && state.failedGeneration === state.requestedGeneration
    && state.failedGeneration > state.verifiedGeneration;
  const needsFollowUp = liveGeneration !== null
    && state.requestedGeneration <= liveGeneration;
  const noPendingGeneration = liveGeneration === null
    && state.requestedGeneration <= state.verifiedGeneration;
  const advancesGeneration = retryingCurrentFailure
    || needsFollowUp
    || noPendingGeneration;
  const requestedGeneration = advancesGeneration
    ? state.requestedGeneration + 1n
    : state.requestedGeneration;

  if (reason === 'order_transmission_requested') {
    if (
      !advancesGeneration
      && state.refreshReason === 'same_hash_confirmation'
    ) {
      return {
        requestedGeneration,
        failedGeneration: state.failedGeneration,
        freshnessFence,
      };
    }
    const isJoiningPendingOrder = !advancesGeneration
      && state.refreshReason === 'order_transmission_requested'
      && state.refreshRequestedAt !== null;
    const firstPendingOrderAt = isJoiningPendingOrder
      ? state.refreshRequestedAt!
      : now;
    const currentNotBefore = isJoiningPendingOrder && state.syncNotBefore
      ? state.syncNotBefore.getTime()
      : now.getTime();
    const settledAt = Math.max(currentNotBefore, now.getTime() + SELLPIA_ORDER_SETTLE_MS);
    const cappedAt = Math.min(
      firstPendingOrderAt.getTime() + SELLPIA_ORDER_SETTLE_CAP_MS,
      settledAt,
    );
    return {
      requestedGeneration,
      failedGeneration: state.failedGeneration,
      refreshRequestedAt: firstPendingOrderAt,
      refreshReason: reason,
      syncNotBefore: new Date(cappedAt),
      freshnessFence,
    };
  }

  if (!advancesGeneration) {
    return {
      requestedGeneration,
      failedGeneration: state.failedGeneration,
      freshnessFence,
    };
  }

  return {
    requestedGeneration,
    failedGeneration: state.failedGeneration,
    refreshRequestedAt: now,
    refreshReason: reason,
    syncNotBefore: now,
    freshnessFence,
  };
}

export function planOrderTransmissionFinalization(
  state: SellpiaInventoryFreshnessState,
  now: Date,
  freshnessFence: string,
): SellpiaInventoryFreshnessStatePatch {
  const latestVisibleGeneration = [
    state.requestedGeneration,
    state.verifiedGeneration,
    state.activeGeneration ?? 0n,
  ].reduce((latest, generation) => generation > latest ? generation : latest, 0n);
  const isJoiningPendingOrder = state.refreshReason === 'order_transmission_requested'
    && state.refreshRequestedAt !== null;
  const firstPendingOrderAt = isJoiningPendingOrder
    ? state.refreshRequestedAt!
    : now;
  const currentNotBefore = isJoiningPendingOrder && state.syncNotBefore
    ? state.syncNotBefore.getTime()
    : now.getTime();
  const settledAt = Math.max(
    currentNotBefore,
    now.getTime() + SELLPIA_ORDER_SETTLE_MS,
  );
  const cappedAt = Math.min(
    firstPendingOrderAt.getTime() + SELLPIA_ORDER_SETTLE_CAP_MS,
    settledAt,
  );

  return {
    requestedGeneration: latestVisibleGeneration + 1n,
    failedGeneration: state.failedGeneration,
    refreshRequestedAt: firstPendingOrderAt,
    refreshReason: 'order_transmission_requested',
    syncNotBefore: new Date(cappedAt),
    freshnessFence,
  };
}

export function planClaim(
  state: SellpiaInventoryFreshnessState,
  input: {
    now: Date;
    userId: string;
    claimToken: string;
    freshnessFence: string;
  },
): SellpiaClaimDecision {
  if (
    state.unresolvedOrderTransmissionIntentCount > 0
    || hasLiveLease(state, input.now)
    || !isSourceBindingConfirmed(state)
  ) {
    return { kind: 'joined' };
  }

  const ttlExpired = state.requestedGeneration === state.verifiedGeneration
    && state.lastVerifiedAt !== null
    && input.now.getTime() - state.lastVerifiedAt.getTime() >= SELLPIA_FRESHNESS_TTL_MS;
  const generation = ttlExpired
    ? state.requestedGeneration + 1n
    : state.requestedGeneration;
  const pending = ttlExpired || generation > state.verifiedGeneration;
  const failedWithoutRetry = !ttlExpired
    && state.failedGeneration === generation
    && generation > state.verifiedGeneration;
  const due = ttlExpired
    || state.syncNotBefore === null
    || state.syncNotBefore <= input.now;
  if (!pending || failedWithoutRetry || !due) return { kind: 'joined' };

  const leaseExpiresAt = new Date(input.now.getTime() + SELLPIA_CLAIM_LEASE_MS);
  return {
    kind: 'claimed',
    generation,
    leaseExpiresAt,
    patch: {
      requestedGeneration: generation,
      refreshRequestedAt: ttlExpired ? input.now : state.refreshRequestedAt,
      refreshReason: ttlExpired ? 'ttl_expired' : state.refreshReason,
      syncNotBefore: ttlExpired ? input.now : state.syncNotBefore,
      activeSyncToken: input.claimToken,
      activeSyncOwnerUserId: input.userId,
      activeSyncStartedAt: input.now,
      activeSyncLeaseExpiresAt: leaseExpiresAt,
      activeGeneration: generation,
      freshnessFence: input.freshnessFence,
    },
  };
}

export function planHeartbeat(
  state: SellpiaInventoryFreshnessState,
  input: {
    now: Date;
    userId: string;
    claimToken: string;
    freshnessFence: string;
  },
): SellpiaInventoryFreshnessStatePatch | null {
  if (!ownsLiveLease(state, input)) return null;
  return {
    activeSyncLeaseExpiresAt: new Date(input.now.getTime() + SELLPIA_CLAIM_LEASE_MS),
    freshnessFence: input.freshnessFence,
  };
}

export function planFailure(
  state: SellpiaInventoryFreshnessState,
  input: {
    now: Date;
    userId: string;
    claimToken: string;
    errorCode: SellpiaInventoryCollectionFailureCode;
    errorMessage: string;
    freshnessFence: string;
  },
): SellpiaInventoryFreshnessStatePatch | null {
  if (!ownsLiveLease(state, input) || state.activeGeneration === null) return null;
  return {
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeGeneration: null,
    failedGeneration: state.activeGeneration,
    lastAttemptAt: input.now,
    lastAttemptStatus: 'failed',
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage,
    freshnessFence: input.freshnessFence,
  };
}

export function planCancel(
  state: SellpiaInventoryFreshnessState,
  input: {
    now: Date;
    userId: string;
    claimToken: string;
    freshnessFence: string;
  },
): SellpiaInventoryFreshnessStatePatch | null {
  if (!ownsLiveLease(state, input)) return null;
  return {
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeGeneration: null,
    freshnessFence: input.freshnessFence,
  };
}

export function hasLiveLease(
  state: SellpiaInventoryFreshnessState,
  now: Date,
): boolean {
  return state.activeSyncLeaseExpiresAt !== null
    && state.activeSyncLeaseExpiresAt > now;
}

export function isSourceBindingConfirmed(
  state: SellpiaInventoryFreshnessState,
): boolean {
  return state.sourceOrigin === SELLPIA_SOURCE_ORIGIN
    && state.sourceAccountKey === SELLPIA_SOURCE_ACCOUNT_KEY;
}

function ownsLiveLease(
  state: SellpiaInventoryFreshnessState,
  input: { now: Date; userId: string; claimToken: string },
): boolean {
  return hasLiveLease(state, input.now)
    && state.activeSyncToken === input.claimToken
    && state.activeSyncOwnerUserId === input.userId;
}
