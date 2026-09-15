'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { sendToExtension, type ExtensionRuntimeStatus } from '@/lib/extension-bridge';
import {
  beginOrderCollectionSourceAttempt,
  failOrderCollectionSourceAttempt,
  getOrderCollectionEnvironmentKey,
  newOrderCollectionIdempotencyKey,
  readActiveOrderCollectionAttempt,
  readOrderCollectionSourceAttempt,
  rememberActiveOrderCollectionAttempt,
  type ActiveOrderCollectionAttempt,
  type OrderCollectionSourceAttemptControl,
} from '../lib/order-collection-source-owner';
import { cancelMallOrderCollectionAttempt } from '../lib/mall-order-collection-source';
import { cancelCoupangDirectshipAttempt } from '../lib/coupang-directship-collection-source';
import {
  detectOrderCollectionSessionExtensionStatus,
  OrderCollectionExtensionUnavailableError,
  orderCollectionExtensionUnavailableMessage,
  type OrderCollectionExtensionRun,
} from '../lib/order-collection-extension';
import {
  beginCoupangDirectAttempt,
  failCoupangDirectAttempt,
  newCoupangDirectIdempotencyKey,
  readActiveCoupangDirectAttempt,
  readCoupangDirectAttempt,
  readCoupangDirectAttemptControl,
  rememberActiveCoupangDirectAttempt,
  type CoupangDirectOwnerAttempt,
  type CoupangDirectOwnerAttemptControl,
} from '../lib/coupang-directship-source-owner';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const UNMAPPED_RESTART_MESSAGE =
  '이 작업은 주문 수집 계정과 연결되지 않아 이 화면에서 자동 재실행할 수 없습니다. 원래 실행 화면에서 다시 시작해주세요.';

type ActiveScope = {
  organizationId: string;
  environmentKey: string;
  attempt: ActiveOrderCollectionAttempt | null;
};

type ActiveRun = {
  run: OrderCollectionExtensionRun;
  abortController: AbortController;
};

function attemptQueryKey(
  organizationId: string,
  environmentKey: string,
  attemptId: string,
) {
  return [
    'orders',
    'collection-source-attempt',
    organizationId,
    environmentKey,
    attemptId,
  ] as const;
}

/**
 * The mall-specific procedure around an owner attempt: turning an admitted
 * attempt into an extension run, conversion and upload fences, the terminal
 * submissions, and the reloaded screen's resume hint.
 *
 * Admission itself is not here. Starting a mall, refusing a second start of
 * the same mall and the operator stop belong to the shared collection control
 * (KID-147, KID-189); the owner's organization-scoped status read is what
 * every browser sees as running.
 */
export function useOrderCollectionSessionControls(
  mallAccounts: OrderCollectionMallAccount[],
  rocketChannelAccountId: string | null = null,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const environmentKey = getOrderCollectionEnvironmentKey();
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);
  const activeRunsRef = useRef(new Map<string, ActiveRun>());

  useEffect(() => {
    if (!organizationId) {
      setActiveScope(null);
      return;
    }
    setActiveScope({
      organizationId,
      environmentKey,
      attempt: readActiveOrderCollectionAttempt(organizationId, environmentKey),
    });
  }, [environmentKey, organizationId]);

  const scopedAttempt = activeScope?.organizationId === organizationId
    && activeScope.environmentKey === environmentKey
    ? activeScope.attempt
    : null;
  const ownerQueryKey = scopedAttempt?.attemptId && organizationId
    ? attemptQueryKey(organizationId, environmentKey, scopedAttempt.attemptId)
    : ['orders', 'collection-source-attempt', organizationId ?? '', environmentKey, 'none'] as const;
  const ownerQuery = useQuery(collectionSourceStatusQueryOptions({
    queryKey: ownerQueryKey,
    queryFn: () => readOrderCollectionSourceAttempt(scopedAttempt!.attemptId!),
    enabled: Boolean(organizationId && scopedAttempt?.attemptId),
    refetchInterval: (query) => query.state.data?.state === 'RUNNING' ? 2_000 : false,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }));
  const attempt = ownerQuery.data ?? null;
  const restartAccount = useMemo(() => {
    const mallKey = attempt?.plan.mallKey;
    return typeof mallKey === 'string'
      ? mallAccounts.find((account) => account.key === mallKey) ?? null
      : null;
  }, [attempt?.plan.mallKey, mallAccounts]);

  /**
   * An attempt is remembered as the latest one, which a reloaded screen offers to
   * resume, and under its mall. It is a hint only: whether a mall is collecting
   * is the owner's status read, never this record.
   */
  const setScopedAttempt = useCallback((next: ActiveOrderCollectionAttempt, mallKey?: string) => {
    if (!organizationId) return;
    rememberActiveOrderCollectionAttempt(organizationId, next, environmentKey);
    if (mallKey) {
      rememberActiveOrderCollectionAttempt(organizationId, next, environmentKey, mallKey);
    }
    setActiveScope({ organizationId, environmentKey, attempt: next });
  }, [environmentKey, organizationId]);

  /**
   * Turns an attempt the owner already admitted into this browser's run. The
   * fence token comes from the admission, so no second control read is needed,
   * and a manual upload runs without an extension.
   */
  const activateOwnerRun = useCallback((
    account: OrderCollectionMallAccount,
    admitted: OrderCollectionSourceAttemptControl,
    extensionId?: string,
  ): OrderCollectionExtensionRun => {
    const abortController = new AbortController();
    const run: OrderCollectionExtensionRun = {
      attemptId: admitted.attemptId,
      attemptToken: admitted.attemptToken,
      ...(extensionId ? { extensionId } : {}),
      date: admitted.plan.collectionDate,
      signal: abortController.signal,
      ...(admitted.plan.collectionMode === 'browser' ? { serverOwned: true } : {}),
      ...(admitted.plan.selectionMode ? { selectionMode: admitted.plan.selectionMode } : {}),
      ...(admitted.plan.seenRowKeys ? { seenRowKeys: [...admitted.plan.seenRowKeys] } : {}),
    };
    activeRunsRef.current.set(account.key, { run, abortController });
    if (organizationId) {
      queryClient.setQueryData(
        attemptQueryKey(organizationId, environmentKey, admitted.attemptId),
        admitted,
      );
    }
    return run;
  }, [environmentKey, organizationId, queryClient]);

  const activateDirectAttempt = useCallback(async (
    account: OrderCollectionMallAccount,
    owner: CoupangDirectOwnerAttempt,
    knownExtensionStatus?: ExtensionRuntimeStatus,
    admittedToken?: string,
    allowCompleted = false,
  ): Promise<OrderCollectionExtensionRun> => {
    if (owner.state !== 'RUNNING' && !(allowCompleted && owner.state === 'COMPLETE')) {
      throw new Error(owner.errorMessage ?? `${account.name} 주문 수집 시도가 이미 종료되었습니다.`);
    }
    const control: CoupangDirectOwnerAttemptControl = admittedToken
      ? { ...owner, attemptToken: admittedToken }
      : await readCoupangDirectAttemptControl(owner.attemptId);
    let extensionId: string | undefined;
    if (owner.state === 'RUNNING') {
      const extensionStatus = knownExtensionStatus
        ?? await detectOrderCollectionSessionExtensionStatus();
      if (extensionStatus.status !== 'ready') {
        await failCoupangDirectAttempt(control, {
          code: 'EXTENSION_UNAVAILABLE',
          message: orderCollectionExtensionUnavailableMessage(extensionStatus),
        }).catch(() => undefined);
        throw new OrderCollectionExtensionUnavailableError(
          orderCollectionExtensionUnavailableMessage(extensionStatus),
        );
      }
      extensionId = extensionStatus.extensionId;
    }
    const abortController = new AbortController();
    const run: OrderCollectionExtensionRun = {
      attemptId: control.attemptId,
      attemptToken: control.attemptToken,
      ...(extensionId ? { extensionId } : {}),
      date: null,
      signal: abortController.signal,
      sourceOwner: 'coupang_directship',
    };
    activeRunsRef.current.set(account.key, { run, abortController });
    return run;
  }, []);

  /** Turns a directship attempt the shared control admitted into this browser's run. */
  const activateDirectOwnerRun = useCallback((
    account: OrderCollectionMallAccount,
    admitted: CoupangDirectOwnerAttemptControl,
    extensionId: string,
  ): OrderCollectionExtensionRun => {
    const abortController = new AbortController();
    const run: OrderCollectionExtensionRun = {
      attemptId: admitted.attemptId,
      attemptToken: admitted.attemptToken,
      extensionId,
      date: null,
      signal: abortController.signal,
      sourceOwner: 'coupang_directship',
    };
    activeRunsRef.current.set(account.key, { run, abortController });
    return run;
  }, []);

  /**
   * The directship purchase-order calendar opens its own attempt before the
   * operator picks arrival dates, then collects against that same attempt.
   */
  const prepareDirectRun = useCallback(async (
    account: OrderCollectionMallAccount,
    existingAttemptId?: string,
    knownExtensionStatus?: ExtensionRuntimeStatus,
  ): Promise<OrderCollectionExtensionRun> => {
    const active = activeRunsRef.current.get(account.key);
    if (existingAttemptId && active?.run.attemptId === existingAttemptId) {
      return active.run;
    }
    if (existingAttemptId) {
      const existing = await readCoupangDirectAttempt(existingAttemptId);
      return activateDirectAttempt(
        account,
        existing,
        knownExtensionStatus,
        undefined,
        existing.state === 'COMPLETE',
      );
    }
    if (organizationId) {
      const persisted = readActiveCoupangDirectAttempt(organizationId, environmentKey);
      if (persisted?.attemptId) {
        try {
          const existing = await readCoupangDirectAttempt(persisted.attemptId);
          if (
            existing.state !== 'FAILED'
            && (!rocketChannelAccountId || existing.plan.channelAccountId === rocketChannelAccountId)
          ) {
            return activateDirectAttempt(
              account,
              existing,
              knownExtensionStatus,
              undefined,
              existing.state === 'COMPLETE',
            );
          }
        } catch (error) {
          if (!isApiError(error) || error.status !== 404) throw error;
        }
        rememberActiveCoupangDirectAttempt(organizationId, {
          attemptId: null,
          idempotencyKey: null,
          channelAccountId: null,
        }, environmentKey);
      }
    }
    if (!rocketChannelAccountId) {
      throw new Error('활성 쿠팡 로켓 채널 계정을 먼저 선택해 주세요.');
    }
    const persisted = organizationId
      ? readActiveCoupangDirectAttempt(organizationId, environmentKey)
      : null;
    const idempotencyKey = persisted?.idempotencyKey ?? newCoupangDirectIdempotencyKey();
    if (organizationId) {
      rememberActiveCoupangDirectAttempt(organizationId, {
        attemptId: null,
        idempotencyKey,
        channelAccountId: rocketChannelAccountId,
      }, environmentKey);
    }
    let started: CoupangDirectOwnerAttemptControl;
    try {
      started = await beginCoupangDirectAttempt(
        idempotencyKey,
        rocketChannelAccountId,
      );
    } catch (error) {
      if (isApiError(error) && error.status >= 400 && error.status < 500 && organizationId) {
        rememberActiveCoupangDirectAttempt(organizationId, {
          attemptId: null,
          idempotencyKey: null,
          channelAccountId: null,
        }, environmentKey);
      }
      throw error;
    }
    if (organizationId) {
      rememberActiveCoupangDirectAttempt(organizationId, {
        attemptId: started.attemptId,
        idempotencyKey,
        channelAccountId: rocketChannelAccountId,
      }, environmentKey);
    }
    return activateDirectAttempt(
      account,
      started,
      knownExtensionStatus,
      started.attemptToken,
    );
  }, [activateDirectAttempt, environmentKey, organizationId, rocketChannelAccountId]);

  /**
   * Manual uploads are source-owner attempts too. They need no extension
   * admission, but their conversion carries the same fence so the server can
   * terminalize the exact attempt that owns the file.
   */
  const prepareManualUploadRun = useCallback(async (
    account: OrderCollectionMallAccount,
  ): Promise<OrderCollectionExtensionRun> => {
    if (!organizationId) {
      throw new Error('주문 수집을 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    const idempotencyKey = newOrderCollectionIdempotencyKey();
    const started = await beginOrderCollectionSourceAttempt(idempotencyKey, {
      mallKey: account.key,
      collectionDate: null,
      collectionMode: 'manual-upload',
    });
    setScopedAttempt({
      attemptId: started.attemptId,
      idempotencyKey,
      mallKey: account.key,
    }, account.key);
    return activateOwnerRun(account, started);
  }, [activateOwnerRun, organizationId, setScopedAttempt]);

  const syncRun = useCallback(async (attemptId: string) => {
    const active = [...activeRunsRef.current.values()]
      .find((entry) => entry.run.attemptId === attemptId);
    if (active?.run.sourceOwner === 'coupang_directship') {
      const current = await readCoupangDirectAttempt(attemptId);
      if (current.state !== 'RUNNING' && organizationId) {
        rememberActiveCoupangDirectAttempt(organizationId, {
          attemptId: null,
          idempotencyKey: null,
          channelAccountId: null,
        }, environmentKey);
      }
      return current;
    }
    const current = await readOrderCollectionSourceAttempt(attemptId);
    if (organizationId) {
      queryClient.setQueryData(
        attemptQueryKey(organizationId, environmentKey, current.attemptId),
        current,
      );
    }
    return current;
  }, [environmentKey, organizationId, queryClient]);

  const failRun = useCallback(async (
    run: OrderCollectionExtensionRun,
    code: string,
    message: string,
    sourcePayload?: unknown,
  ) => {
    if (run.sourceOwner === 'coupang_directship') {
      return failCoupangDirectAttempt(run, { code, message });
    }
    const result = await failOrderCollectionSourceAttempt(run, {
      code,
      message,
      ...(sourcePayload === undefined ? {} : { sourcePayload }),
    });
    if (organizationId) {
      queryClient.setQueryData(
        attemptQueryKey(organizationId, environmentKey, result.attemptId),
        result,
      );
    }
    return result;
  }, [environmentKey, organizationId, queryClient]);

  /**
   * Ends the attempt this browser opened outside the shared control — the
   * directship calendar's, or a manual upload's. The owner stop carries no
   * fence token, and a stop the owner refused is reported instead of being
   * swallowed (KID-191).
   */
  const cancelRun = useCallback(async (account: OrderCollectionMallAccount) => {
    const active = activeRunsRef.current.get(account.key);
    if (!active) return false;
    active.abortController.abort();
    try {
      if (active.run.extensionId) {
        await sendToExtension(
          active.run.extensionId,
          { action: 'cancelCollectionSession', attemptId: active.run.attemptId },
        ).catch(() => undefined);
      }
      await (active.run.sourceOwner === 'coupang_directship'
        ? cancelCoupangDirectshipAttempt(active.run.attemptId)
        : cancelMallOrderCollectionAttempt(active.run.attemptId));
      await syncRun(active.run.attemptId).catch(() => undefined);
      return true;
    } finally {
      if (activeRunsRef.current.get(account.key)?.run.attemptId === active.run.attemptId) {
        activeRunsRef.current.delete(account.key);
      }
      if (active.run.sourceOwner === 'coupang_directship' && organizationId) {
        rememberActiveCoupangDirectAttempt(organizationId, {
          attemptId: null,
          idempotencyKey: null,
          channelAccountId: null,
        }, environmentKey);
      }
    }
  }, [environmentKey, organizationId, syncRun]);

  /**
   * Ends this browser's procedure for an attempt the shared control is
   * stopping, so the page stops driving a collection the owner already ended.
   */
  const abortLocalRun = useCallback((attemptId: string) => {
    for (const [mallKey, active] of activeRunsRef.current) {
      if (active.run.attemptId !== attemptId) continue;
      active.abortController.abort();
      activeRunsRef.current.delete(mallKey);
    }
  }, []);

  const releaseRun = useCallback((mallKey: string, expectedAttemptId?: string) => {
    const current = activeRunsRef.current.get(mallKey);
    if (!expectedAttemptId || current?.run.attemptId === expectedAttemptId) {
      activeRunsRef.current.delete(mallKey);
    }
  }, []);

  return {
    abortLocalRun,
    attempt,
    activateOwnerRun,
    activateDirectOwnerRun,
    cancelRun,
    failRun,
    prepareDirectRun,
    prepareManualUploadRun,
    releaseRun,
    restartAccount,
    syncRun,
    webRestartUnavailableMessage: attempt && !restartAccount
      ? UNMAPPED_RESTART_MESSAGE
      : undefined,
    // Kept as an explicit null so callers cannot accidentally treat the
    // retired generic browser session as the source-of-truth terminal state.
    session: null,
  };
}
