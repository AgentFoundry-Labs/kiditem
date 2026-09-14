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
  isOrderCollectionAttemptNotFound,
  newOrderCollectionIdempotencyKey,
  readActiveOrderCollectionAttempt,
  readOrderCollectionSourceAttempt,
  readOrderCollectionSourceAttemptControl,
  rememberActiveOrderCollectionAttempt,
  type ActiveOrderCollectionAttempt,
  type OrderCollectionSourceAttempt,
  type OrderCollectionSourceAttemptControl,
} from '../lib/order-collection-source-owner';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
  type OrderCollectionExtensionRun,
} from '../lib/order-collection-extension';
import { todayYmd } from '../lib/order-collection-page-model';
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

type OrderCollectionMode = 'browser' | 'manual-upload';

type OrderCollectionRunOptions = {
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
  /** Browser provider reads are admitted against this exact calendar date. */
  collectionDate?: string;
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
 * Order collection owns the source attempt. Reloads only read the public owner
 * projection; extension detection and provider work happen after an explicit
 * prepareRun call has admitted (or replayed) an owner attempt.
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
  const [cancellingKeys, setCancellingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const activeRunsRef = useRef(new Map<string, ActiveRun>());
  const startingRef = useRef(false);

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

  const setScopedAttempt = useCallback((next: ActiveOrderCollectionAttempt) => {
    if (!organizationId) return;
    rememberActiveOrderCollectionAttempt(organizationId, next, environmentKey);
    setActiveScope({ organizationId, environmentKey, attempt: next });
  }, [environmentKey, organizationId]);

  const activateAttempt = useCallback(async (
    account: OrderCollectionMallAccount,
    owner: OrderCollectionSourceAttempt,
    collectionMode: OrderCollectionMode,
    knownExtensionStatus?: ExtensionRuntimeStatus,
    admittedToken?: string,
    options: OrderCollectionRunOptions = {},
  ): Promise<OrderCollectionExtensionRun> => {
    if (owner.state !== 'RUNNING') {
      throw new Error(owner.errorMessage ?? `${account.name} 주문 수집 시도가 이미 종료되었습니다.`);
    }
    // The public read is safe on reload. The control projection is only read
    // after the user explicitly resumes this running attempt because it exposes
    // the provider fence token needed by conversion endpoints.
    const control = admittedToken
      ? { ...owner, attemptToken: admittedToken }
      : await readOrderCollectionSourceAttemptControl(owner.attemptId);
    let extensionId: string | undefined;
    if (collectionMode === 'browser') {
      const extensionStatus = knownExtensionStatus
        ?? await detectOrderCollectionSessionExtensionStatus();
      if (extensionStatus.status !== 'ready') {
        await failOrderCollectionSourceAttempt(control, {
          code: 'EXTENSION_UNAVAILABLE',
          message: orderCollectionExtensionUnavailableMessage(extensionStatus),
        }).catch(() => undefined);
        throw new Error(orderCollectionExtensionUnavailableMessage(extensionStatus));
      }
      extensionId = extensionStatus.extensionId;
    }
    const abortController = new AbortController();
    const run: OrderCollectionExtensionRun = {
      attemptId: control.attemptId,
      attemptToken: control.attemptToken,
      ...(extensionId ? { extensionId } : {}),
      date: owner.plan.collectionDate,
      signal: abortController.signal,
      ...(collectionMode === 'browser' ? { serverOwned: true } : {}),
      ...(owner.plan.selectionMode ? { selectionMode: owner.plan.selectionMode } : {}),
      ...(owner.plan.seenRowKeys ? { seenRowKeys: [...owner.plan.seenRowKeys] } : {}),
    };
    activeRunsRef.current.set(account.key, { run, abortController });
    return run;
  }, []);

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
        throw new Error(orderCollectionExtensionUnavailableMessage(extensionStatus));
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

  const prepareOwnerRun = useCallback(async (
    account: OrderCollectionMallAccount,
    collectionMode: OrderCollectionMode,
    existingAttemptId?: string,
    knownExtensionStatus?: ExtensionRuntimeStatus,
    options: OrderCollectionRunOptions = {},
  ): Promise<OrderCollectionExtensionRun> => {
    if (!organizationId) {
      throw new Error('주문 수집을 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    if (startingRef.current) {
      throw new Error('주문 수집이 이미 시작되었습니다.');
    }
    startingRef.current = true;
    try {
      let persisted = readActiveOrderCollectionAttempt(organizationId, environmentKey);
      if (existingAttemptId && persisted?.attemptId !== existingAttemptId) {
        persisted = { attemptId: existingAttemptId, idempotencyKey: null };
      }

      if (persisted?.attemptId) {
        try {
          const current = await readOrderCollectionSourceAttempt(persisted.attemptId);
          queryClient.setQueryData(
            attemptQueryKey(organizationId, environmentKey, current.attemptId),
            current,
          );
          if (
            current.state === 'RUNNING'
            && current.plan.mallKey === account.key
            && current.plan.collectionMode === collectionMode
          ) {
            setScopedAttempt({
              attemptId: current.attemptId,
              idempotencyKey: persisted.idempotencyKey,
            });
            return activateAttempt(account, current, collectionMode, knownExtensionStatus, undefined, options);
          }
          // Terminal attempts never get provider work replayed. An explicit
          // click starts a fresh owner attempt with a fresh idempotency key.
          persisted = { attemptId: null, idempotencyKey: null };
          setScopedAttempt(persisted);
        } catch (error) {
          if (!isOrderCollectionAttemptNotFound(error)) throw error;
          // A persisted attempt can belong to a previous organization/session
          // or an expired server record. Only this explicit start clears it;
          // passive mount reads remain side-effect free.
          persisted = { attemptId: null, idempotencyKey: null };
          setScopedAttempt(persisted);
        }
      }

      const idempotencyKey = persisted?.idempotencyKey ?? newOrderCollectionIdempotencyKey();
      const collectionDate = collectionMode === 'browser'
        ? persisted?.collectionDate ?? options.collectionDate ?? todayYmd()
        : null;
      const selectionMode = collectionMode === 'browser'
        ? persisted?.selectionMode ?? options.selectionMode ?? 'manual'
        : undefined;
      const seenRowKeys = selectionMode === 'automatic'
        ? [...(persisted?.seenRowKeys ?? options.seenRowKeys ?? [])]
        : undefined;
      // Store the uncertain admission key before the request. A lost response
      // replays the exact begin request instead of creating a second attempt.
      setScopedAttempt({
        attemptId: null,
        idempotencyKey,
        ...(collectionMode === 'browser' ? { collectionDate } : {}),
        ...(selectionMode ? { selectionMode } : {}),
        ...(seenRowKeys ? { seenRowKeys } : {}),
      });
      let started: OrderCollectionSourceAttemptControl;
      try {
        started = await beginOrderCollectionSourceAttempt(idempotencyKey, {
          mallKey: account.key,
          collectionDate,
          collectionMode,
          ...(selectionMode ? { selectionMode } : {}),
          ...(seenRowKeys ? { seenRowKeys } : {}),
        });
      } catch (error) {
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          setScopedAttempt({ attemptId: null, idempotencyKey: null });
        }
        throw error;
      }
      setScopedAttempt({ attemptId: started.attemptId, idempotencyKey });
      queryClient.setQueryData(
        attemptQueryKey(organizationId, environmentKey, started.attemptId),
        started,
      );
      return activateAttempt(
        account,
        started,
        collectionMode,
        knownExtensionStatus,
        started.attemptToken,
        options,
      );
    } finally {
      startingRef.current = false;
    }
  }, [
    activateAttempt,
    environmentKey,
    organizationId,
    queryClient,
    setScopedAttempt,
  ]);

  const prepareRun = useCallback(async (
    account: OrderCollectionMallAccount,
    existingAttemptId?: string,
    knownExtensionStatus?: ExtensionRuntimeStatus,
    options: OrderCollectionRunOptions = {},
  ) => account.key === 'coupang-direct'
    ? prepareDirectRun(account, existingAttemptId, knownExtensionStatus)
    : prepareOwnerRun(account, 'browser', existingAttemptId, knownExtensionStatus, options), [
    prepareDirectRun,
    prepareOwnerRun,
  ]);

  const prepareManualUploadRun = useCallback(async (
    account: OrderCollectionMallAccount,
  ) => prepareOwnerRun(account, 'manual-upload'), [prepareOwnerRun]);

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

  const cancelRun = useCallback(async (account: OrderCollectionMallAccount) => {
    const active = activeRunsRef.current.get(account.key);
    if (!active) return false;
    setCancellingKeys((current) => new Set(current).add(account.key));
    active.abortController.abort();
    try {
      if (active.run.extensionId) {
        await sendToExtension(
          active.run.extensionId,
          { action: 'cancelCollectionSession', attemptId: active.run.attemptId },
        ).catch(() => undefined);
      }
      await failRun(active.run, 'USER_CANCELLED', '주문 수집을 중단했습니다.').catch(
        () => undefined,
      );
      await syncRun(active.run.attemptId).catch(() => undefined);
      return true;
    } finally {
      if (activeRunsRef.current.get(account.key)?.run.attemptId === active.run.attemptId) {
        activeRunsRef.current.delete(account.key);
      }
      if (account.key === 'coupang-direct' && organizationId) {
        rememberActiveCoupangDirectAttempt(organizationId, {
          attemptId: null,
          idempotencyKey: null,
          channelAccountId: null,
        }, environmentKey);
      }
      setCancellingKeys((current) => {
        const next = new Set(current);
        next.delete(account.key);
        return next;
      });
    }
  }, [environmentKey, failRun, organizationId, syncRun]);

  const releaseRun = useCallback((mallKey: string, expectedAttemptId?: string) => {
    const current = activeRunsRef.current.get(mallKey);
    if (!expectedAttemptId || current?.run.attemptId === expectedAttemptId) {
      activeRunsRef.current.delete(mallKey);
      setCancellingKeys((keys) => {
        const next = new Set(keys);
        next.delete(mallKey);
        return next;
      });
    }
  }, []);

  return {
    attempt,
    cancelRun,
    cancellingKeys,
    failRun,
    prepareRun,
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
