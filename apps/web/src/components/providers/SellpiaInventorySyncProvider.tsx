'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

export const SELLPIA_HEARTBEAT_INTERVAL_MS = 20_000;
export const SELLPIA_LEASE_MS = 90_000;

const inFlightByOrganization = new Map<string, Promise<void>>();

function dueForClaim(state: SellpiaInventoryFreshnessView): boolean {
  if (state.status !== 'refresh_required') return false;
  if (!state.sourceBinding.confirmed || state.activeSync) return false;
  return !state.syncNotBefore || Date.parse(state.syncNotBefore) <= Date.now();
}

async function serializeClaim(
  organizationId: string,
  operation: () => Promise<void>,
): Promise<void> {
  const run = async () => {
    if (inFlightByOrganization.has(organizationId)) return;
    const promise = operation().finally(() => {
      if (inFlightByOrganization.get(organizationId) === promise) {
        inFlightByOrganization.delete(organizationId);
      }
    });
    inFlightByOrganization.set(organizationId, promise);
    await promise;
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(
      `kiditem:sellpia-inventory:${organizationId}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock) await run();
      },
    );
    return;
  }
  await run();
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
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (ownerClaimTokenRef.current) {
        abandonedClaims.current.add(ownerClaimTokenRef.current);
      }
      stopHeartbeatRef.current?.();
      if (user?.organizationId) inFlightByOrganization.delete(user.organizationId);
    };
  }, [user?.organizationId]);

  useEffect(() => {
    if (enabled || !ownerClaimTokenRef.current) return;
    abandonedClaims.current.add(ownerClaimTokenRef.current);
    stopHeartbeatRef.current?.();
    if (user?.organizationId) inFlightByOrganization.delete(user.organizationId);
    ownerClaimTokenRef.current = null;
    extensionIdRef.current = null;
    setOwnerClaimToken(null);
  }, [enabled, user?.organizationId]);

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
      }),
    ]);
    await invalidateSellpiaInventory(queryClient);
    ownerClaimTokenRef.current = null;
    extensionIdRef.current = null;
    if (mounted.current) setOwnerClaimToken(null);
  }, [queryClient]);

  const coordinate = useCallback(async () => {
    const organizationId = user?.organizationId;
    if (!organizationId) return;
    const claim = await sellpiaInventoryFreshnessApi.claimDue();
    if (!claim.claimed) {
      queryClient.setQueryData(queryKeys.inventory.freshness(), claim.state);
      return;
    }

    const { claimToken } = claim;
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
    queryClient.setQueryData(queryKeys.inventory.freshness(), claim.state);

    let leaseExpiresAt = Date.parse(claim.leaseExpiresAt);
    let heartbeatStopped = false;
    const heartbeatTimer = window.setInterval(() => {
      if (heartbeatStopped || Date.now() >= leaseExpiresAt) return;
      void sellpiaInventoryFreshnessApi.heartbeat(claimToken).then((state) => {
        if (state.activeSync?.runId === claimToken) {
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

    await startOperationAlert({
      operationKey: `browser-collection:${claimToken}`,
      type: 'browser_collection',
      title: 'Sellpia 재고 갱신',
      message: 'Sellpia 재고 파일을 수집하고 있습니다.',
      sourceType: 'browser_collection_session',
      sourceId: 'inventory.sellpia',
      href: '/inventory-hub?tab=overview',
      progress: 0,
      metadata: { claimToken, generation: claim.activeGeneration },
    });

    try {
      const collected = await collectSellpiaInventory({ runId: claimToken });
      extensionIdRef.current = collected.extensionId;
      if (
        cancelledClaims.current.has(claimToken)
        || abandonedClaims.current.has(claimToken)
      ) return;
      await progressOperationAlert(`browser-collection:${claimToken}`, {
        message: 'Sellpia 재고 파일을 검증하고 있습니다.',
        progress: 0.5,
      });

      let imported;
      try {
        imported = await sellpiaInventoryFreshnessApi.importBrowser(collected.file, {
          claimToken,
          activeGeneration: claim.activeGeneration,
          trigger,
        });
      } catch (error) {
        const details = errorDetails(error);
        await Promise.allSettled([
          sellpiaInventoryFreshnessApi.fail(claimToken, {
            errorCode: details.code,
            errorMessage: details.message,
          }),
          finalizeSellpiaInventorySession(
            { extensionId: collected.extensionId, runId: claimToken },
            'failed',
            details.message,
          ),
          failOperationAlert(`browser-collection:${claimToken}`, {
            message: details.message,
            severity: 'error',
          }),
        ]);
        return;
      }

      try {
        await finalizeSellpiaInventorySession(
          { extensionId: collected.extensionId, runId: claimToken },
          'succeeded',
          'Sellpia 재고 갱신이 완료되었습니다.',
        );
        await succeedOperationAlert(`browser-collection:${claimToken}`, {
          message: 'Sellpia 재고 갱신이 완료되었습니다.',
          progress: 1,
        });
      } catch (error) {
        await failOperationAlert(`browser-collection:${claimToken}`, {
          message: `재고 반영은 완료되었지만 확장 세션 정리에 실패했습니다: ${errorDetails(error).message}`,
          severity: 'warning',
        });
      }

      const fileHash = imported.run.fileHash;
      for (const issue of imported.run.qualityReport?.issues ?? []) {
        const warningIdentity = issue.code.startsWith(`${fileHash}:`)
          ? issue.code
          : `${fileHash}:${issue.code}`;
        const warningCode = warningIdentity.slice(fileHash.length + 1);
        const operationKey = `sellpia-inventory-quality:${warningIdentity}`;
        const metadata = { fileHash, warningCode };
        await startOperationAlert({
          operationKey,
          type: 'sellpia_inventory_quality',
          title: 'Sellpia 재고 품질 확인 필요',
          message: `${warningCode}: ${issue.count}건`,
          sourceType: 'sellpia_inventory_import',
          sourceId: imported.run.id,
          href: '/inventory-hub?tab=overview',
          severity: issue.severity,
          metadata,
        });
        await requireAttentionOperationAlert(operationKey, {
          message: `${warningCode}: ${issue.count}건`,
          severity: issue.severity,
          metadata,
        });
      }
    } catch (error) {
      if (
        cancelledClaims.current.has(claimToken)
        || abandonedClaims.current.has(claimToken)
      ) return;
      const details = errorDetails(error);
      await Promise.allSettled([
        sellpiaInventoryFreshnessApi.fail(claimToken, {
          errorCode: details.code,
          errorMessage: details.message,
        }),
        failOperationAlert(`browser-collection:${claimToken}`, {
          message: details.message,
          severity: 'error',
          metadata: details.reason ? { attentionReason: details.reason } : undefined,
        }),
      ]);
    } finally {
      stopHeartbeat();
      stopHeartbeatRef.current = null;
      await invalidateSellpiaInventory(queryClient);
      if (ownerClaimTokenRef.current === claimToken) {
        ownerClaimTokenRef.current = null;
        extensionIdRef.current = null;
        if (mounted.current) setOwnerClaimToken(null);
      }
    }
  }, [queryClient, user?.organizationId]);

  useEffect(() => {
    if (!enabled || !user?.organizationId || !freshness.state || !dueForClaim(freshness.state)) {
      return;
    }
    void serializeClaim(user.organizationId, coordinate);
  }, [coordinate, enabled, freshness.state, user?.organizationId]);

  return (
    <>
      {children}
      {enabled && freshness.state ? (
        <>
          <SellpiaFreshnessStatus
            status={freshness.state.status}
            lastVerifiedAt={freshness.state.lastVerifiedAt}
            onOpen={() => setDrawerOpen(true)}
          />
          <SellpiaFreshnessDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            state={freshness.state}
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
    </>
  );
}
