import {
  deriveSellpiaInventoryFreshness,
  type SellpiaInventoryCollectionFailureCode,
  type SellpiaInventoryFreshnessStatus,
  type SellpiaInventoryFreshnessView,
  type SellpiaInventoryRefreshReason,
  type SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_SOURCE_ACCOUNT_KEY = 'kiditem' as const;
export const SELLPIA_FRESHNESS_TTL_MS = 10 * 60_000;
// HTTP accepts only manual/retry. This policy also preserves established
// internal inventory triggers when replaying an existing generation.
type SellpiaInventoryRequestReason = SellpiaInventoryRefreshReason;
export type SellpiaInventoryFreshnessState = {
  organizationId: string;
  sourceOrigin: string;
  sourceAccountKey: string | null;
  lastVerifiedAt: Date | null;
  lastCompletedImportRunId: string | null;
  refreshRequestedAt: Date | null;
  refreshReason: SellpiaInventoryRefreshReason | null;
  requestedSyncScope: SellpiaSyncScope;
  syncNotBefore: Date | null;
  activeSyncToken: string | null;
  activeSyncOwnerUserId: string | null;
  activeSyncStartedAt: Date | null;
  activeSyncLeaseExpiresAt: Date | null;
  activeSyncScope: SellpiaSyncScope | null;
  requestedGeneration: bigint;
  activeGeneration: bigint | null;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  lastAttemptAt: Date | null;
  lastAttemptSyncScope: SellpiaSyncScope | null;
  lastErrorCode: SellpiaInventoryCollectionFailureCode | null;
  lastErrorMessage: string | null;
  freshnessFence: string;
};

export type SellpiaInventoryFreshnessStatePatch = Partial<
  Omit<SellpiaInventoryFreshnessState, 'organizationId'>
>;

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
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeSyncScope: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 0n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptSyncScope: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: input.freshnessFence,
  };
}

export function deriveFreshnessStatus(
  state: SellpiaInventoryFreshnessState,
  now: Date,
): SellpiaInventoryFreshnessStatus {
  if (hasExpiredCurrentAttempt(state, now)) return 'failed';
  return deriveSellpiaInventoryFreshness({
    now,
    lastVerifiedAt: state.lastVerifiedAt,
    requestedGeneration: state.requestedGeneration,
    verifiedGeneration: state.verifiedGeneration,
    failedGeneration: state.failedGeneration,
    activeSyncLeaseExpiresAt: state.activeSyncLeaseExpiresAt,
  });
}

export function toFreshnessView(
  state: SellpiaInventoryFreshnessState,
  now: Date,
  userId: string | null,
): SellpiaInventoryFreshnessView {
  const status = deriveFreshnessStatus(state, now);
  const expiredCurrentAttempt = hasExpiredCurrentAttempt(state, now);
  const activeSync = hasLiveLease(state, now)
    && state.activeSyncToken
    && state.activeGeneration !== null
    && state.activeSyncStartedAt
    && state.activeSyncLeaseExpiresAt
    ? {
      runId: state.activeSyncToken,
      generation: state.activeGeneration.toString(),
      scope: state.activeSyncScope ?? 'inventory',
      startedAt: state.activeSyncStartedAt.toISOString(),
      leaseExpiresAt: state.activeSyncLeaseExpiresAt.toISOString(),
      canControl: userId !== null && state.activeSyncOwnerUserId === userId,
    }
    : null;
  const lastAttempt = expiredCurrentAttempt && state.activeSyncStartedAt
    ? {
      attemptedAt: state.activeSyncStartedAt.toISOString(),
      trigger: state.refreshReason,
      scope: state.activeSyncScope ?? state.requestedSyncScope,
      errorCode: null,
      errorMessage: 'Sellpia inventory collection attempt expired.',
    }
    : state.lastAttemptAt
      ? {
        attemptedAt: state.lastAttemptAt.toISOString(),
        trigger: state.refreshReason,
        scope: state.lastAttemptSyncScope ?? 'inventory',
        errorCode: state.lastErrorCode,
        errorMessage: state.lastErrorMessage,
      }
      : null;

  return {
    status,
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
    requestedSyncScope: state.requestedSyncScope,
    syncNotBefore: state.syncNotBefore?.toISOString() ?? null,
    activeSync,
    lastAttempt,
  };
}

function hasExpiredCurrentAttempt(
  state: SellpiaInventoryFreshnessState,
  now: Date,
): boolean {
  return state.activeGeneration !== null
    && state.activeGeneration === state.requestedGeneration
    && state.activeGeneration > state.verifiedGeneration
    && state.activeSyncLeaseExpiresAt !== null
    && state.activeSyncLeaseExpiresAt <= now;
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
  reason: SellpiaInventoryRequestReason,
  scope: SellpiaSyncScope,
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

  if (!advancesGeneration) {
    return {
      requestedGeneration,
      requestedSyncScope: strongestScope(state.requestedSyncScope, scope),
      failedGeneration: state.failedGeneration,
      freshnessFence,
    };
  }

  return {
    requestedGeneration,
    failedGeneration: state.failedGeneration,
    refreshRequestedAt: now,
    refreshReason: reason,
    requestedSyncScope: scope,
    syncNotBefore: now,
    freshnessFence,
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

function strongestScope(
  current: SellpiaSyncScope,
  requested: SellpiaSyncScope,
): SellpiaSyncScope {
  return current === 'full' || requested === 'full' ? 'full' : 'inventory';
}
