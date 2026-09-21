import {
  deriveSellpiaInventoryCollectionStatus,
  type SellpiaInventoryCollectionFailureCode,
  type SellpiaInventoryCollectionStatus,
  type SellpiaInventoryCollectionStatusView,
  type SellpiaInventoryCollectionTrigger,
  type SellpiaInventoryStoredCollectionTrigger,
  type SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_SOURCE_ACCOUNT_KEY = 'kiditem' as const;

/** The database row is an organization-scoped collection control record. */
export type SellpiaInventoryCollectionState = {
  organizationId: string;
  sourceOrigin: string;
  sourceAccountKey: string | null;
  /** Source completion time. Kept under the migration-era column name. */
  lastVerifiedAt: Date | null;
  lastCompletedImportRunId: string | null;
  /** Request/lease fields remain internal fencing facts, not public freshness. */
  refreshReason: SellpiaInventoryStoredCollectionTrigger | null;
  requestedSyncScope: SellpiaSyncScope;
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

export type SellpiaInventoryCollectionStatePatch = Partial<
  Omit<SellpiaInventoryCollectionState, 'organizationId'>
>;

export function createInitialCollectionState(input: {
  organizationId: string;
  now: Date;
  freshnessFence: string;
}): SellpiaInventoryCollectionState {
  return {
    organizationId: input.organizationId,
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: null,
    lastVerifiedAt: null,
    lastCompletedImportRunId: null,
    refreshReason: 'initial_snapshot',
    requestedSyncScope: 'inventory',
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

export function deriveCollectionStatus(
  state: SellpiaInventoryCollectionState,
  now: Date,
): SellpiaInventoryCollectionStatus {
  if (hasExpiredCurrentAttempt(state, now)) return 'failed';
  return deriveSellpiaInventoryCollectionStatus({
    now,
    requestedGeneration: state.requestedGeneration,
    verifiedGeneration: state.verifiedGeneration,
    failedGeneration: state.failedGeneration,
    activeSyncLeaseExpiresAt: state.activeSyncLeaseExpiresAt,
  });
}

export function toCollectionStatusView(
  state: SellpiaInventoryCollectionState,
  now: Date,
  userId: string | null,
  leaseAttemptId: string | null,
  lastAttemptId: string | null = leaseAttemptId ?? state.lastCompletedImportRunId,
): SellpiaInventoryCollectionStatusView {
  const status = deriveCollectionStatus(state, now);
  const expiredCurrentAttempt = hasExpiredCurrentAttempt(state, now);
  const activeSync = hasLiveLease(state, now)
    && state.activeSyncToken
    && state.activeGeneration !== null
    && state.activeSyncStartedAt
    && state.activeSyncLeaseExpiresAt
    ? {
      attemptId: leaseAttemptId,
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
      trigger: publicTrigger(state.refreshReason),
      scope: state.activeSyncScope ?? state.requestedSyncScope,
      errorCode: 'sellpia_background_timeout',
      errorMessage: 'Sellpia inventory collection attempt expired.',
    }
    : state.lastAttemptAt
      ? {
        attemptedAt: state.lastAttemptAt.toISOString(),
        trigger: publicTrigger(state.refreshReason),
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
    requestedGeneration: state.requestedGeneration.toString(),
    verifiedGeneration: state.verifiedGeneration.toString(),
    lastCompletedAttemptId: state.lastCompletedImportRunId,
    lastCompletedAt: state.lastVerifiedAt?.toISOString() ?? null,
    lastAttemptId,
    activeSync,
    lastAttempt,
  };
}

function publicTrigger(
  trigger: SellpiaInventoryStoredCollectionTrigger | null,
): SellpiaInventoryCollectionTrigger | null {
  return trigger && trigger !== 'ttl_expired' && trigger !== 'purchase_preflight'
    ? trigger
    : null;
}

function hasExpiredCurrentAttempt(
  state: SellpiaInventoryCollectionState,
  now: Date,
): boolean {
  return state.activeGeneration !== null
    && state.activeGeneration === state.requestedGeneration
    && state.activeGeneration > state.verifiedGeneration
    && state.activeSyncLeaseExpiresAt !== null
    && state.activeSyncLeaseExpiresAt <= now;
}

export function planSourceBindingConfirmation(
  state: SellpiaInventoryCollectionState,
  freshnessFence: string,
): SellpiaInventoryCollectionStatePatch {
  return {
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
    freshnessFence,
  };
}

export function planCollectionRequest(
  state: SellpiaInventoryCollectionState,
  reason: SellpiaInventoryStoredCollectionTrigger,
  scope: SellpiaSyncScope,
  now: Date,
  freshnessFence: string,
): SellpiaInventoryCollectionStatePatch {
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
    refreshReason: reason,
    requestedSyncScope: scope,
    freshnessFence,
  };
}

export function hasLiveLease(
  state: SellpiaInventoryCollectionState,
  now: Date,
): boolean {
  return state.activeSyncLeaseExpiresAt !== null
    && state.activeSyncLeaseExpiresAt > now;
}

export function isSourceBindingConfirmed(
  state: SellpiaInventoryCollectionState,
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
