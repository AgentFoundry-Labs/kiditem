'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import type {
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryFreshnessView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { useAuth } from '@/hooks/useAuth';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import {
  cancelSellpiaInventorySession,
  collectSellpiaInventory,
  finalizeSellpiaInventorySession,
} from '@/lib/sellpia-inventory-extension';
import {
  cancelOperationAlert,
  failOperationAlert,
  progressOperationAlert,
  requireAttentionOperationAlert,
  startOperationAlert,
  succeedOperationAlert,
} from '@/lib/operation-alerts';
import { queryKeys } from '@/lib/query-keys';
import { invalidateSellpiaInventory } from '@/app/(inventory)/_shared/invalidate-sellpia-inventory';
import {
  SellpiaFreshnessDrawer,
  SellpiaFreshnessStatus,
} from '@/components/sellpia-inventory';
import { SellpiaInventorySyncContext } from '@/components/sellpia-inventory/SellpiaInventorySyncContext';

export const SELLPIA_HEARTBEAT_INTERVAL_MS = 20_000;
export const SELLPIA_LEASE_MS = 90_000;

const inFlightByLockName = new Map<string, Promise<void>>();

export function sellpiaInventoryLockName(organizationId: string): string {
  return `kiditem:sellpia-inventory:${organizationId}`;
}

function dueForClaim(state: SellpiaInventoryFreshnessView): boolean {
  if (state.status !== 'refresh_required') return false;
  if (!state.sourceBinding.confirmed || state.activeSync) return false;
  return !state.syncNotBefore || Date.parse(state.syncNotBefore) <= Date.now();
}

function cacheFreshnessIfChanged(
  queryClient: ReturnType<typeof useQueryClient>,
  state: SellpiaInventoryFreshnessView,
): void {
  const queryKey = queryKeys.inventory.freshness();
  const current = queryClient.getQueryData<SellpiaInventoryFreshnessView>(queryKey);
  if (current && JSON.stringify(current) === JSON.stringify(state)) return;
  queryClient.setQueryData(queryKey, state);
}

async function serializeClaim(
  lockName: string,
  operation: () => Promise<void>,
): Promise<void> {
  const run = async () => {
    if (inFlightByLockName.has(lockName)) return;
    const promise = operation().finally(() => {
      if (inFlightByLockName.get(lockName) === promise) {
        inFlightByLockName.delete(lockName);
      }
    });
    inFlightByLockName.set(lockName, promise);
    await promise;
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(
      lockName,
      { ifAvailable: true },
      async (lock) => {
        if (lock) await run();
      },
    );
    return;
  }
  await run();
}

async function bestEffortAlert(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Operation Alerts are observability and never own inventory success/failure.
  }
}

function errorDetails(error: unknown): {
  code: SellpiaInventoryCollectionFailureCode;
  message: string;
  reason?: string;
} {
  const candidate = error as {
    failureCode?: SellpiaInventoryCollectionFailureCode;
    reason?: string;
    message?: string;
  };
  return {
    code: candidate.failureCode ?? 'sellpia_network_failed',
    message: (candidate.message ?? 'Sellpia 재고 갱신에 실패했습니다.').slice(0, 300),
    reason: candidate.reason,
  };
}

export function SellpiaInventorySyncProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { status: authStatus, user } = useAuth();
  const enabled = authStatus === 'ready' && Boolean(user?.organizationId);
  const freshness = useSellpiaInventoryFreshness({ enabled });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ownerClaimToken, setOwnerClaimToken] = useState<string | null>(null);
  const ownerClaimTokenRef = useRef<string | null>(null);
  const extensionIdRef = useRef<string | null>(null);
  const stopHeartbeatRef = useRef<(() => void) | null>(null);
  const cancelledClaims = useRef(new Set<string>());
  const abandonedClaims = useRef(new Set<string>());
  const alertUpdatedAtByClaim = useRef(new Map<string, number>());
  const mounted = useRef(false);
  const activeLockNameRef = useRef<string | null>(null);
  const authContextRef = useRef({
    status: authStatus,
    userId: user?.id ?? null,
    organizationId: user?.organizationId ?? null,
    enabled,
    epoch: 0,
  });
  const currentAuthContext = authContextRef.current;
  if (
    currentAuthContext.status !== authStatus
    || currentAuthContext.userId !== (user?.id ?? null)
    || currentAuthContext.organizationId !== (user?.organizationId ?? null)
  ) {
    authContextRef.current = {
      status: authStatus,
      userId: user?.id ?? null,
      organizationId: user?.organizationId ?? null,
      enabled,
      epoch: currentAuthContext.epoch + 1,
    };
  }
  const authEpoch = authContextRef.current.epoch;
  const observedAuthEpochRef = useRef(authEpoch);

  const nextAlertMetadata = useCallback((
    claimToken: string,
    details: Record<string, unknown> = {},
  ) => {
    const previous = alertUpdatedAtByClaim.current.get(claimToken) ?? -1;
    const collectionUpdatedAt = Math.max(Date.now(), previous + 1);
    alertUpdatedAtByClaim.current.set(claimToken, collectionUpdatedAt);
    return {
      ...details,
      browserCollection: true,
      collectionAttempt: 1,
      collectionUpdatedAt,
    };
  }, []);

  const shouldStopClaim = useCallback((claimToken: string) =>
    !mounted.current
    || cancelledClaims.current.has(claimToken)
    || abandonedClaims.current.has(claimToken), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (ownerClaimTokenRef.current) {
        abandonedClaims.current.add(ownerClaimTokenRef.current);
      }
      stopHeartbeatRef.current?.();
      if (activeLockNameRef.current) {
        inFlightByLockName.delete(activeLockNameRef.current);
        activeLockNameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (observedAuthEpochRef.current === authEpoch) return;
    observedAuthEpochRef.current = authEpoch;
    if (ownerClaimTokenRef.current) {
      abandonedClaims.current.add(ownerClaimTokenRef.current);
    }
    stopHeartbeatRef.current?.();
    if (activeLockNameRef.current) {
      inFlightByLockName.delete(activeLockNameRef.current);
      activeLockNameRef.current = null;
    }
    ownerClaimTokenRef.current = null;
    extensionIdRef.current = null;
    setOwnerClaimToken(null);
  }, [authEpoch]);

  const cancelOwnedSync = useCallback(async (claimToken: string) => {
    if (ownerClaimTokenRef.current !== claimToken) return;
    cancelledClaims.current.add(claimToken);
    stopHeartbeatRef.current?.();
    const extensionRun = extensionIdRef.current
      ? { extensionId: extensionIdRef.current, runId: claimToken }
      : { runId: claimToken };
    await Promise.allSettled([
      cancelSellpiaInventorySession(extensionRun),
      sellpiaInventoryFreshnessApi.cancel(claimToken),
      cancelOperationAlert(`browser-collection:${claimToken}`, {
        message: '사용자가 Sellpia 재고 갱신을 취소했습니다.',
        metadata: nextAlertMetadata(claimToken),
      }),
    ]);
    await invalidateSellpiaInventory(queryClient);
    ownerClaimTokenRef.current = null;
    extensionIdRef.current = null;
    alertUpdatedAtByClaim.current.delete(claimToken);
    if (mounted.current) setOwnerClaimToken(null);
  }, [nextAlertMetadata, queryClient]);

  const coordinate = useCallback(async () => {
    const organizationId = user?.organizationId;
    const claimedAuthContext = authContextRef.current;
    if (
      !organizationId
      || !claimedAuthContext.enabled
      || claimedAuthContext.organizationId !== organizationId
    ) return;
    const authContextIsCurrent = () => {
      const authContext = authContextRef.current;
      return mounted.current
        && authContext.epoch === claimedAuthContext.epoch
        && authContext.enabled
        && authContext.organizationId === organizationId;
    };
    const claim = await sellpiaInventoryFreshnessApi.claimDue();
    if (!authContextIsCurrent()) {
      if (claim.claimed) abandonedClaims.current.add(claim.claimToken);
      return;
    }
    if (!claim.claimed) {
      cacheFreshnessIfChanged(queryClient, claim.state);
      return;
    }

    const { claimToken } = claim;
    const claimIsStopped = () =>
      !authContextIsCurrent() || shouldStopClaim(claimToken);
    if (claimIsStopped()) {
      abandonedClaims.current.add(claimToken);
      return;
    }
    const trigger = claim.state.refreshReason;
    if (!trigger) {
      await sellpiaInventoryFreshnessApi.fail(claimToken, {
        errorCode: 'sellpia_network_failed',
        errorMessage: 'Sellpia refresh claim is missing its trigger.',
      });
      return;
    }

    ownerClaimTokenRef.current = claimToken;
    if (mounted.current) setOwnerClaimToken(claimToken);
    cacheFreshnessIfChanged(queryClient, claim.state);

    let leaseExpiresAt = Date.parse(claim.leaseExpiresAt);
    let heartbeatStopped = false;
    const heartbeatTimer = window.setInterval(() => {
      if (heartbeatStopped || claimIsStopped() || Date.now() >= leaseExpiresAt) return;
      void sellpiaInventoryFreshnessApi.heartbeat(claimToken).then((state) => {
        if (!claimIsStopped() && state.activeSync?.runId === claimToken) {
          leaseExpiresAt = Date.parse(state.activeSync.leaseExpiresAt);
          queryClient.setQueryData(queryKeys.inventory.freshness(), state);
        }
      }).catch(() => undefined);
    }, SELLPIA_HEARTBEAT_INTERVAL_MS);
    const stopHeartbeat = () => {
      heartbeatStopped = true;
      window.clearInterval(heartbeatTimer);
    };
    stopHeartbeatRef.current = stopHeartbeat;

    try {
      if (claimIsStopped()) return;
      await bestEffortAlert(() => startOperationAlert({
        operationKey: `browser-collection:${claimToken}`,
        type: 'browser_collection',
        title: 'Sellpia 재고 갱신',
        message: 'Sellpia 재고 파일을 수집하고 있습니다.',
        sourceType: 'browser_collection_session',
        sourceId: 'inventory.sellpia',
        href: '/inventory-hub?tab=sellpia-sync',
        progress: 0,
        metadata: nextAlertMetadata(claimToken, {
          claimToken,
          generation: claim.activeGeneration,
        }),
      }));
      if (claimIsStopped()) return;

      const collected = await collectSellpiaInventory({ runId: claimToken });
      if (claimIsStopped()) return;
      extensionIdRef.current = collected.extensionId;
      await bestEffortAlert(() => progressOperationAlert(
        `browser-collection:${claimToken}`,
        {
          message: 'Sellpia 재고 파일을 검증하고 있습니다.',
          progress: 0.5,
          metadata: nextAlertMetadata(claimToken),
        },
      ));
      if (claimIsStopped()) return;

      let imported;
      try {
        imported = await sellpiaInventoryFreshnessApi.importBrowser(collected.file, {
          claimToken,
          activeGeneration: claim.activeGeneration,
          trigger,
        });
      } catch (error) {
        if (claimIsStopped()) return;
        const details = errorDetails(error);
        await sellpiaInventoryFreshnessApi.fail(claimToken, {
          errorCode: details.code,
          errorMessage: details.message,
        }).catch(() => undefined);
        if (claimIsStopped()) return;
        await finalizeSellpiaInventorySession(
          { extensionId: collected.extensionId, runId: claimToken },
          'failed',
          details.message,
        ).catch(() => undefined);
        if (claimIsStopped()) return;
        await bestEffortAlert(() => failOperationAlert(
          `browser-collection:${claimToken}`,
          {
            message: details.message,
            severity: 'error',
            metadata: nextAlertMetadata(claimToken),
          },
        ));
        return;
      }

      if (claimIsStopped()) return;
      let extensionFinalized = true;
      try {
        await finalizeSellpiaInventorySession(
          { extensionId: collected.extensionId, runId: claimToken },
          'succeeded',
          'Sellpia 재고 갱신이 완료되었습니다.',
        );
      } catch (error) {
        extensionFinalized = false;
        if (claimIsStopped()) return;
        await bestEffortAlert(() => failOperationAlert(
          `browser-collection:${claimToken}`,
          {
            message: `재고 반영은 완료되었지만 확장 세션 정리에 실패했습니다: ${errorDetails(error).message}`,
            severity: 'warning',
            metadata: nextAlertMetadata(claimToken),
          },
        ));
      }
      if (claimIsStopped()) return;

      if (extensionFinalized) {
        await bestEffortAlert(() => succeedOperationAlert(
          `browser-collection:${claimToken}`,
          {
            message: 'Sellpia 재고 갱신이 완료되었습니다.',
            progress: 1,
            metadata: nextAlertMetadata(claimToken),
          },
        ));
        if (claimIsStopped()) return;
      }

      const fileHash = imported.run.fileHash;
      for (const issue of imported.run.qualityReport?.issues ?? []) {
        if (claimIsStopped()) return;
        const warningIdentity = issue.code.startsWith(`${fileHash}:`)
          ? issue.code
          : `${fileHash}:${issue.code}`;
        const warningCode = warningIdentity.slice(fileHash.length + 1);
        const operationKey = `sellpia-inventory-quality:${warningIdentity}`;
        const qualityMetadata = { fileHash, warningCode };
        await bestEffortAlert(() => startOperationAlert({
          operationKey,
          type: 'sellpia_inventory_quality',
          title: 'Sellpia 재고 품질 확인 필요',
          message: `${warningCode}: ${issue.count}건`,
          sourceType: 'sellpia_inventory_import',
          sourceId: imported.run.id,
          href: '/stock-ops?tab=freshness',
          severity: issue.severity,
          metadata: nextAlertMetadata(claimToken, qualityMetadata),
        }));
        if (claimIsStopped()) return;
        await bestEffortAlert(() => requireAttentionOperationAlert(
          operationKey,
          {
            message: `${warningCode}: ${issue.count}건`,
            severity: issue.severity,
            metadata: nextAlertMetadata(claimToken, qualityMetadata),
          },
        ));
      }
    } catch (error) {
      if (claimIsStopped()) return;
      const details = errorDetails(error);
      await sellpiaInventoryFreshnessApi.fail(claimToken, {
        errorCode: details.code,
        errorMessage: details.message,
      }).catch(() => undefined);
      if (claimIsStopped()) return;
      await bestEffortAlert(() => failOperationAlert(
        `browser-collection:${claimToken}`,
        {
          message: details.message,
          severity: 'error',
          metadata: nextAlertMetadata(
            claimToken,
            details.reason ? { attentionReason: details.reason } : {},
          ),
        },
      ));
    } finally {
      stopHeartbeat();
      if (stopHeartbeatRef.current === stopHeartbeat) {
        stopHeartbeatRef.current = null;
      }
      await invalidateSellpiaInventory(queryClient);
      if (ownerClaimTokenRef.current === claimToken) {
        ownerClaimTokenRef.current = null;
        extensionIdRef.current = null;
        if (mounted.current) setOwnerClaimToken(null);
      }
      alertUpdatedAtByClaim.current.delete(claimToken);
    }
  }, [nextAlertMetadata, queryClient, shouldStopClaim, user?.organizationId]);

  useEffect(() => {
    if (!enabled || !user?.organizationId || !freshness.state || !dueForClaim(freshness.state)) {
      return;
    }
    const lockName = sellpiaInventoryLockName(user.organizationId);
    activeLockNameRef.current = lockName;
    void serializeClaim(lockName, coordinate)
      .catch(() => undefined)
      .finally(() => {
        if (
          activeLockNameRef.current === lockName
          && !inFlightByLockName.has(lockName)
        ) {
          activeLockNameRef.current = null;
        }
      });
  }, [
    coordinate,
    enabled,
    freshness.pollVersion,
    freshness.state,
    user?.organizationId,
  ]);

  const contextValue = enabled && freshness.state
    ? { state: freshness.state, openDrawer: () => setDrawerOpen(true) }
    : null;
  const usesInlineStatus = pathname === '/product-hub/matching';

  return (
    <SellpiaInventorySyncContext.Provider value={contextValue}>
      {children}
      {enabled && freshness.state ? (
        <>
          {usesInlineStatus ? null : <SellpiaFreshnessStatus
            status={freshness.state.status}
            lastVerifiedAt={freshness.state.lastVerifiedAt}
            onOpen={() => setDrawerOpen(true)}
          />}
          <SellpiaFreshnessDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            state={freshness.state}
            currentBasis={freshness.currentBasis}
            history={freshness.history}
            isHistoryLoading={freshness.isHistoryLoading}
            userRole={user?.role ?? ''}
            ownerClaimToken={ownerClaimToken}
            onCancel={(claimToken) => void cancelOwnedSync(claimToken)}
            onConfirmBinding={() => void freshness.confirmSourceBinding()}
            onRequestRefresh={() => void freshness.requestRefresh('retry')}
            onManualImport={freshness.importManual}
          />
        </>
      ) : null}
    </SellpiaInventorySyncContext.Provider>
  );
}
