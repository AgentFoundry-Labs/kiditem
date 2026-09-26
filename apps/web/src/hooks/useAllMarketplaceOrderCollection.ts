'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { createBrowserMallCollector } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import {
  collectMallOrderOperation,
  collectsViaMallOrderOperation,
  mallOrderOperationSource,
  type MallOrderOperationHandoff,
} from '@/app/(orders)/order-collection/lib/mall-order-operation-source';
import type { OperationListResponse } from '@kiditem/shared/operation';
import { isDuplicateGeneratedFile } from '@/app/(orders)/order-collection/lib/generated-file-dedup';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from '@/app/(orders)/order-collection/lib/order-generated-file-store';
import { runWithConcurrency } from '@/app/(orders)/order-collection/lib/order-collection-concurrency';
import {
  closeOrderCollectionTabsViaExtension,
  type OrderCollectionExtensionRun,
} from '@/app/(orders)/order-collection/lib/order-collection-extension';
import {
  collectsViaCoupangDirectship,
  coupangDirectshipCollectionSource,
  type CoupangDirectshipHandoff,
} from '@/app/(orders)/order-collection/lib/coupang-directship-collection-source';
import {
  createCoupangDirectshipCollector,
  type CoupangDirectshipSelection,
} from '@/app/(orders)/order-collection/lib/coupang-directship-collection';
import {
  mallOrderCollectionSource,
  refusedAsNotConfigured,
  type MallOrderCollectionHandoff,
  type MallOrderCollectionSourceList,
  type MallOrderCollectionStartInput,
} from '@/app/(orders)/order-collection/lib/mall-order-collection-source';
import {
  startCollectionSource,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import type { OrderCollectionSourceAdapter } from '@/app/(orders)/order-collection/lib/order-collection-source-adapter';
import { useAuth } from '@/hooks/useAuth';
import {
  classifyOrderCollectionFailure,
  isBrowserCollectableMall,
  mallCollectionFailureMessage,
  orderCollectionFailureEvidence,
  orderCollectionBatchNotice,
  todayYmd,
  type ConversionHistoryItem,
} from '@/app/(orders)/order-collection/lib/order-collection-page-model';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from '@/lib/order-mall-account-api';
import {
  collectSellpiaOrderSnapshot,
  reconcileCollectedOrdersWithSellpia,
  SELLPIA_RECONCILE_PARTIAL_MESSAGE,
} from '@/app/(orders)/order-collection/lib/sellpia-order-reconcile';
import { useOrderCollectionSessionControls } from '@/app/(orders)/order-collection/hooks/use-order-collection-session-controls';
import type { BrowserMallCollectionResult } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';

const COLLECT_ALL_CONCURRENCY = 4;
const NOOP = () => undefined;
const NOOP_ACTIVITY = (
  _kind: MarketplaceOrderCollectionActivityKind,
  _mallName: string,
  _message?: string,
) => undefined;
const EMPTY_MALL_ACCOUNTS: OrderCollectionMallAccount[] = [];

export type MarketplaceOrderCollectionActivityKind =
  | 'empty'
  | 'auth'
  | 'login'
  | 'error';

/** 중단이 끝낸 절차의 거절. 표준 취소와 같은 이름이라 중단인 줄 알아볼 수 있다. */
function collectionStoppedError(): Error {
  return new DOMException(COLLECTION_STOPPED_MESSAGE, 'AbortError');
}

/**
 * Ends the tracked collection the moment the operator's stop reaches it, even
 * when the mall's own procedure never observes that stop: a generator parked on
 * an extension message that never arrives (a mall that opened no tab, one left
 * on a login page) leaves its promise pending for good, so the stopped notice
 * never shows and a batch waits on it forever (KID-220).
 *
 * The underlying collection is left to settle whenever it does; this promise
 * already answered, so a later success or failure changes nothing.
 */
function endsWhenStopped<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const stop = () => {
      if (settled) return;
      settled = true;
      reject(collectionStoppedError());
    };
    const answer = (settle: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', stop);
      settle();
    };
    operation.then(
      (value) => answer(() => resolve(value)),
      (error: unknown) => answer(() => reject(error)),
    );
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
}

export type MarketplaceOrderCollectionBatchResult = {
  successCount: number;
  failedCount: number;
  /** Malls the owner was already collecting, so this batch opened nothing for them. */
  inProgressCount: number;
  /** Malls this organization has not set up yet, which cannot be started at all. */
  unconfiguredCount: number;
};

type UseAllMarketplaceOrderCollectionOptions = {
  mallAccounts: OrderCollectionMallAccount[];
  rocketChannelAccountId: string | null;
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  setPreviewId?: (id: string) => void;
  clearMallErrorActivity?: (mallName: string) => void;
  logActivity?: (
    kind: MarketplaceOrderCollectionActivityKind,
    mallName: string,
    message?: string,
  ) => void;
};

/**
 * The executable order-collection action shared by the order screen and the
 * dashboard. Both surfaces use the same extension session, collector,
 * conversion, generated-file callback, and empty-vs-login classification.
 */
export function useAllMarketplaceOrderCollection({
  mallAccounts,
  rocketChannelAccountId,
  addGeneratedFile,
  setPreviewId = NOOP,
  clearMallErrorActivity = NOOP,
  logActivity = NOOP_ACTIVITY,
}: UseAllMarketplaceOrderCollectionOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const sessionControls = useOrderCollectionSessionControls(
    mallAccounts,
    rocketChannelAccountId,
  );
  const {
    abortLocalRun,
    activateDirectOwnerRun,
    activateOwnerRun,
    failRun,
    releaseRun,
    syncRun,
  } = sessionControls;
  /** The collection each mall's hand-off left running, for a caller that waits on it. */
  const collectionsRef = useRef(new Map<string, Promise<BrowserMallCollectionResult>>());
  const collectBrowserMall = useMemo(
    () => createBrowserMallCollector({ mallAccounts, addGeneratedFile, setPreviewId }),
    [addGeneratedFile, mallAccounts, setPreviewId],
  );
  const collectDirectship = useMemo(
    () => createCoupangDirectshipCollector({
      rocketChannelAccountId,
      addGeneratedFile,
      setPreviewId,
    }),
    [addGeneratedFile, rocketChannelAccountId, setPreviewId],
  );

  const collectAccount = useCallback(
    async (
      account: OrderCollectionMallAccount,
      run: OrderCollectionExtensionRun,
      directship?: CoupangDirectshipSelection,
    ) => {
      const activeRun = run;
      // 인증(본인확인 · OTP · 캡차)만 사람이 그 화면에서 끝낼 수 있다. 그 몰의 탭만 남기고
      // 나머지는 수집이 끝나는 대로 닫는다(사장님: "수집 끝났으면 창 닫아라").
      let keepTabsForOperator = false;
      try {
        // 어느 절차가 도는지는 이 시도를 허락한 owner 가 정한다 — 몰 키를 보지 않는다(KID-255).
        const collected = activeRun.sourceOwner === 'coupang_directship'
          ? await collectDirectship(account, activeRun, directship)
          : await collectBrowserMall(account, activeRun);
        if (collected.rowCount === 0) {
          // Empty provider results have no converter response to fence. Keep
          // the generic owner terminal instead of leaving a RUNNING attempt
          // forever. Directship is already COMPLETE before this downstream
          // probe, so it must remain a successful no-op rather than issuing
          // a terminal failure against the completed source owner.
          if (activeRun.sourceOwner !== 'coupang_directship') {
            // Confirmed-coverage malls (해법몰 · 도매꾹) complete the owner with an
            // empty snapshot themselves. Failing an attempt that is no longer
            // running is refused as a terminal replay and would turn "no new
            // orders" into a failed collection.
            const current = await syncRun(activeRun.attemptId);
            if (current.state === 'RUNNING') {
              await failRun(
                activeRun,
                'NO_NEW_ORDERS',
                `${account.name} 배송준비전 주문이 없습니다.`,
              );
            }
          }
        } else {
          // Server conversion endpoints complete the source owner after the
          // transient download is produced. Read the owner projection back;
          // generated output bytes never become a web/server artifact.
          await syncRun(activeRun.attemptId);
        }
        clearMallErrorActivity(account.name);
        if (collected.rowCount === 0) logActivity('empty', account.name);
        return collected;
      } catch (error) {
        // 운영자 중단이 이 절차를 끊었으면 terminal 은 owner 취소의 몫이다.
        // 여기서 실패를 먼저 보내면 `COLLECTION_FAILED` 실패 알림이 남는다(KID-159).
        const stopped = activeRun?.signal?.aborted === true;
        const evidence = orderCollectionFailureEvidence(error);
        const message = mallCollectionFailureMessage(
          account.name,
          evidence,
          friendlyError(error, '브라우저 수집 실패') ?? '브라우저 수집 실패',
        );
        const failureKind = classifyOrderCollectionFailure(error, evidence || message);
        const attentionKind = failureKind === 'auth' || failureKind === 'login'
          ? failureKind
          : null;
        keepTabsForOperator = failureKind === 'auth';
        const noNewOrders = !stopped && failureKind === 'empty';
        const ownerReconciliationRequired = error instanceof Error &&
          'ownerReconciliationRequired' in error &&
          (error as Error & { ownerReconciliationRequired?: unknown }).ownerReconciliationRequired === true;
        if (activeRun && attentionKind) {
          // 로그인 · 인증 화면을 만나면 확장은 사람이 볼 수 있게 탭만 남기고 돌아온다. 그때
          // 시도를 끝내지 않으면 임대가 끝나는 30분 동안 카드가 '수집 중'으로 서 있어, 사장님이
          // 로그인하고 와도 다시 시작할 수 없다. owner 가 이미 끝냈으면 그대로 두고, 아직 돌고
          // 있으면 여기서 끝낸다 — 무엇을 해야 하는지는 이유 코드가 말한다.
          const synced = await syncRun(activeRun.attemptId).catch((syncError) => {
            console.warn(
              '[order-collection] failed to sync source attempt',
              syncError,
            );
            return null;
          });
          if (!stopped && synced?.state === 'RUNNING') {
            await failRun(
              activeRun,
              attentionKind === 'auth' ? 'AUTH_REQUIRED' : 'LOGIN_REQUIRED',
              message,
            ).catch((finalizeError) => {
              console.warn(
                '[order-collection] failed to fail source attempt',
                finalizeError,
              );
            });
          }
        }
        if (activeRun && !stopped && !attentionKind && !ownerReconciliationRequired) {
          const unsupported = error instanceof Error && 'sourcePayload' in error
            ? (error as Error & { sourcePayload?: unknown }).sourcePayload
            : undefined;
          await failRun(
            activeRun,
            noNewOrders ? 'NO_NEW_ORDERS' : 'COLLECTION_FAILED',
            noNewOrders
              ? `${account.name} 신규 주문 없음`
              : `${account.name} 파일 생성 실패: ${message}`,
            unsupported,
          ).catch((finalizeError) => {
            console.warn(
              '[order-collection] failed to fail source attempt',
              finalizeError,
            );
          });
        }
        if (noNewOrders) {
          clearMallErrorActivity(account.name);
          logActivity('empty', account.name);
          return { rowCount: 0, masked: false, date: activeRun?.date ?? null };
        }
        if (!stopped) {
          logActivity(attentionKind ?? 'error', account.name, message);
        }
        throw error;
      } finally {
        if (activeRun?.extensionId && !keepTabsForOperator) {
          void closeOrderCollectionTabsViaExtension(activeRun.extensionId, activeRun.attemptId);
        }
        if (activeRun) releaseRun(account.key, activeRun.attemptId);
      }
    },
    [
      clearMallErrorActivity,
      collectBrowserMall,
      collectDirectship,
      failRun,
      logActivity,
      releaseRun,
      syncRun,
    ],
  );

  /**
   * Keeps the collection a hand-off left running, so a batch can wait for it,
   * and tells the operator how the one mall they started ended. A collection
   * the operator stopped is not a failure, and the stop ends it here rather
   * than waiting for the mall's own procedure to notice (KID-220).
   */
  const startCollectionProcedure = useCallback((
    account: OrderCollectionMallAccount,
    signal: AbortSignal | undefined,
    collection: Promise<BrowserMallCollectionResult>,
    report: boolean,
  ) => {
    const tracked = endsWhenStopped(collection, signal);
    collectionsRef.current.set(account.key, tracked);
    tracked.then(
      (collected) => {
        if (!report) return;
        if (collected.masked) toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
        if (collected.rowCount > 0) toast.success(`${account.name} 수집 완료`);
      },
      (error: unknown) => {
        if (!report) return;
        if (signal?.aborted) {
          toast.info(COLLECTION_STOPPED_MESSAGE);
          return;
        }
        toast.error(mallCollectionFailureMessage(
          account.name,
          orderCollectionFailureEvidence(error),
          friendlyError(error, '브라우저 수집 실패') ?? '브라우저 수집 실패',
        ));
      },
    );
  }, []);

  /**
   * The mall's hand-off: the owner already admitted the attempt, so this turns
   * it into a run and lets the collection go on. The start settles here, and
   * the owner's running status is what every screen shows until it ends.
   */
  const handOffMall = useCallback((
    account: OrderCollectionMallAccount,
    { extensionId, attempt }: MallOrderCollectionHandoff,
    report: boolean,
  ) => {
    const run = activateOwnerRun(account, attempt, extensionId);
    startCollectionProcedure(account, run.signal, collectAccount(account, run), report);
    return Promise.resolve();
  }, [activateOwnerRun, collectAccount, startCollectionProcedure]);

  const handOffDirectship = useCallback((
    account: OrderCollectionMallAccount,
    { extensionId, attempt }: CoupangDirectshipHandoff,
    report: boolean,
  ) => {
    const run = activateDirectOwnerRun(account, attempt, extensionId);
    startCollectionProcedure(account, run.signal, collectAccount(account, run), report);
    return Promise.resolve();
  }, [activateDirectOwnerRun, collectAccount, startCollectionProcedure]);

  /**
   * One mall's adapter for the shared control. The card that renders it starts,
   * shows and stops the same collection every other browser sees.
   */
  const mallCollectionAdapter = useCallback((
    account: OrderCollectionMallAccount,
    report = true,
  ): OrderCollectionSourceAdapter<MallOrderCollectionSourceList> => (
    mallOrderCollectionSource({
      organizationId,
      account,
      handOff: (handoff) => handOffMall(account, handoff, report),
      abortLocalRun,
    })
  ), [abortLocalRun, handOffMall, organizationId]);

  /** 실행 kind로 옮긴 몰의 이 브라우저 절차(실행 id → 기다림을 끊는 신호). 중단이 절차부터 끊는다. */
  const operationRunsRef = useRef(new Map<string, AbortController>());
  const abortOperationRun = useCallback((operationId: string) => {
    operationRunsRef.current.get(operationId)?.abort();
    operationRunsRef.current.delete(operationId);
  }, []);

  /**
   * 실행 kind(`orders.mall_orders`)로 옮긴 몰의 절차: 실행이 끝나기를 기다렸다가 실행 id로 변환해 생성 파일을
   * 남긴다(KID-359 H3). 옛 시도가 없으므로 실패·빈 수집을 서버에 따로 적지 않는다 — 실행이 이미 끝을 적었다.
   */
  const collectMallOperationAccount = useCallback(async (
    account: OrderCollectionMallAccount,
    { operationId, collectionDate }: MallOrderOperationHandoff,
    signal: AbortSignal,
  ): Promise<BrowserMallCollectionResult> => {
    try {
      const collected = await collectMallOrderOperation({
        account,
        operationId,
        collectionDate,
        signal,
        addGeneratedFile: (historyItem) => {
          addGeneratedFile(historyItem);
          setPreviewId(historyItem.id);
        },
      });
      clearMallErrorActivity(account.name);
      if (collected.rowCount === 0) logActivity('empty', account.name);
      return collected;
    } catch (error) {
      if (!signal.aborted) {
        const evidence = orderCollectionFailureEvidence(error);
        const message = mallCollectionFailureMessage(
          account.name,
          evidence,
          friendlyError(error, '브라우저 수집 실패') ?? '브라우저 수집 실패',
        );
        const failureKind = classifyOrderCollectionFailure(error, evidence || message);
        logActivity(failureKind === 'auth' || failureKind === 'login' ? failureKind : 'error', account.name, message);
      }
      throw error;
    }
  }, [addGeneratedFile, clearMallErrorActivity, logActivity, setPreviewId]);

  const handOffMallOperation = useCallback((
    account: OrderCollectionMallAccount,
    handoff: MallOrderOperationHandoff,
    report: boolean,
  ) => {
    const controller = new AbortController();
    operationRunsRef.current.set(handoff.operationId, controller);
    const collection = collectMallOperationAccount(account, handoff, controller.signal).finally(() => {
      if (operationRunsRef.current.get(handoff.operationId) === controller) {
        operationRunsRef.current.delete(handoff.operationId);
      }
    });
    startCollectionProcedure(account, controller.signal, collection, report);
    return Promise.resolve();
  }, [collectMallOperationAccount, startCollectionProcedure]);

  /** 실행 kind로 옮긴 몰 카드의 어댑터. 상태는 실행 reader 한 읽기를 네 몰이 나눠 본다. */
  const mallOperationCollectionAdapter = useCallback((
    account: OrderCollectionMallAccount,
    report = true,
  ): OrderCollectionSourceAdapter<OperationListResponse> => (
    mallOrderOperationSource({
      organizationId,
      account,
      handOff: (handoff) => handOffMallOperation(account, handoff, report),
      // 로그인은 확장이 실행 안에서 저장 자격으로 한다(KID-377) — 자격은 어댑터가 차단·간격 규칙대로 싣는다.
      abortLocalRun: abortOperationRun,
    })
  ), [abortOperationRun, handOffMallOperation, organizationId]);

  /**
   * 쿠팡 직배송 카드의 어댑터. 몰 카드가 함께 읽는 목록과 달리 로켓 계정 하나의 원천
   * 상태를 따로 읽으므로, 그 읽기 타입을 그대로 들고 다닌다(KID-214).
   */
  const directshipCollectionAdapter = useCallback((
    account: OrderCollectionMallAccount,
    report = true,
  ): OrderCollectionSourceAdapter<OrderCollectionSourceStatus> => (
    coupangDirectshipCollectionSource({
      channelAccountId: rocketChannelAccountId,
      handOff: (handoff) => handOffDirectship(account, handoff, report),
      abortLocalRun,
    })
  ), [abortLocalRun, handOffDirectship, rocketChannelAccountId]);

  /**
   * Starts one mall through its shared control from outside a mounted card,
   * and names the collection that start left running so a batch can wait for
   * it. A mall the owner is already collecting opens nothing.
   */
  const startMall = useCallback(async (
    account: OrderCollectionMallAccount,
    input: MallOrderCollectionStartInput = {},
  ): Promise<Readonly<{
    outcome: CollectionStartOutcome;
    collection: Promise<BrowserMallCollectionResult> | null;
  }>> => {
    collectionsRef.current.delete(account.key);
    // 어느 원천이 이 몰을 수집하는지는 그 원천이 답한다 — 화면도 루프도 키를 모른다(KID-255).
    const outcome = await (collectsViaCoupangDirectship(account.key)
      ? startCollectionSource(queryClient, directshipCollectionAdapter(account, false), input)
      : collectsViaMallOrderOperation(account.key)
        ? startCollectionSource(queryClient, mallOperationCollectionAdapter(account, false), input)
        : startCollectionSource(queryClient, mallCollectionAdapter(account, false), input));
    return {
      outcome,
      collection: outcome.outcome === 'started'
        ? collectionsRef.current.get(account.key) ?? null
        : null,
    };
  }, [directshipCollectionAdapter, mallCollectionAdapter, mallOperationCollectionAdapter, queryClient]);

  const collectAccounts = useCallback(async (
    accounts: OrderCollectionMallAccount[],
    input: MallOrderCollectionStartInput = {},
  ): Promise<MarketplaceOrderCollectionBatchResult> => {
    if (accounts.length === 0) {
      return { successCount: 0, failedCount: 0, inProgressCount: 0, unconfiguredCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    let unconfiguredCount = 0;
    await runWithConcurrency(accounts, COLLECT_ALL_CONCURRENCY, async (account) => {
      let started: Awaited<ReturnType<typeof startMall>>;
      try {
        // Every mall is admitted by its source owner through the shared start
        // control before extension detection or provider I/O.
        started = await startMall(account, input);
      } catch {
        failedCount += 1;
        return;
      }
      // A mall the owner is already collecting keeps that collection; it is
      // neither a new success nor a failure of this batch (KID-106 Q6).
      if (started.outcome.outcome === 'running') {
        inProgressCount += 1;
        return;
      }
      if (started.outcome.outcome === 'refused') {
        // 아직 설정되지 않은 몰은 시작 자체가 없었던 것이지 수집이 실패한 것이
        // 아니다. 실패로 세면 전체 수집이 고장처럼 읽힌다(KID-170 D1).
        if (refusedAsNotConfigured(started.outcome)) unconfiguredCount += 1;
        else failedCount += 1;
        return;
      }
      // 시작은 됐는데 절차가 남지 않았다(핸드오프가 수집을 걸지 못함). `await null` 은 그냥
      // 통과하므로 그대로 두면 아무것도 안 한 몰이 '수집 완료'로 세어진다(KID-228).
      if (!started.collection) {
        failedCount += 1;
        return;
      }
      try {
        await started.collection;
        successCount += 1;
      } catch {
        failedCount += 1;
      }
    });
    return { successCount, failedCount, inProgressCount, unconfiguredCount };
  }, [startMall]);

  const collectAll = useCallback((
    sourceAccounts: OrderCollectionMallAccount[] = mallAccounts,
    input: MallOrderCollectionStartInput = {},
  ): Promise<MarketplaceOrderCollectionBatchResult> => (
    collectAccounts(
      sourceAccounts.filter((account) => account.enabled && isBrowserCollectableMall(account)),
      input,
    )
  ), [collectAccounts, mallAccounts]);

  return {
    collectAccount,
    collectAccounts,
    collectAll,
    directshipCollectionAdapter,
    mallCollectionAdapter,
    mallOperationCollectionAdapter,
    startMall,
    collectableAccountCount: mallAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    ).length,
    sessionControls,
  };
}

/** Dashboard-ready composition of the same manual order action and file store. */
export function usePersistedAllMarketplaceOrderCollection({
  rocketChannelAccountId,
}: {
  rocketChannelAccountId: string | null;
}) {
  const generatedFileWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mallAccountsQuery = useQuery({
    queryKey: queryKeys.orders.collectionMalls(),
    queryFn: orderMallAccountApi.list,
    meta: { suppressGlobalErrorToast: true },
  });
  const mallAccountsLoading = mallAccountsQuery.isLoading;
  const refetchMallAccounts = mallAccountsQuery.refetch;
  // 이 훅은 앱 전역(자동 운전 고리)에서도 마운트된다. 응답이 배열이 아니면 그때 바로 깨지지
  // 않고 빈 목록으로 선다 — 수집은 목록을 다시 받아 확인한 뒤에만 시작한다.
  const mallAccounts = Array.isArray(mallAccountsQuery.data)
    ? mallAccountsQuery.data
    : EMPTY_MALL_ACCOUNTS;
  const addGeneratedFile = useCallback((historyItem: ConversionHistoryItem) => {
    generatedFileWriteQueueRef.current = generatedFileWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const history = await loadGeneratedOrderFiles();
        if (
          historyItem.collectionMode === 'browser'
          && isDuplicateGeneratedFile(history, historyItem)
        ) {
          return;
        }
        await saveGeneratedOrderFile(historyItem);
      })
      .catch(() => {
        toast.error('생성 파일 목록 저장 실패');
      });
  }, []);
  const {
    collectAll,
  } = useAllMarketplaceOrderCollection({
    mallAccounts,
    rocketChannelAccountId,
    addGeneratedFile,
  });

  /**
   * 전체 수집. `skipMallKeys` 는 사람이 직접 로그인·인증해야 하는 몰이다 — 자동 운전 고리가
   * 넘겨준다. 그 몰을 그냥 돌리면 로그인 화면만 열고 실패하면서 몰 탭을 하나씩 남기고,
   * 그 탭이 바퀴마다 쌓이면 멀쩡한 몰까지 응답 시간 초과로 끌어내린다.
   */
  const collectAllOrders = useCallback(async (
    skipMallKeys: readonly string[] = [],
    options: { automatic?: boolean } = {},
  ) => {
    if (mallAccountsLoading) {
      throw new Error('몰 계정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    }
    const latestAccountsQuery = await refetchMallAccounts();
    if (latestAccountsQuery.isError) {
      throw latestAccountsQuery.error;
    }
    const latestAccounts = latestAccountsQuery.data ?? EMPTY_MALL_ACCOUNTS;
    const latestCollectableAccountCount = latestAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    ).length;
    if (latestCollectableAccountCount === 0) {
      throw new Error('현재 자동 수집 가능한 몰 계정이 없습니다.');
    }

    const skipped = new Set(skipMallKeys);
    const targetAccounts = latestAccounts.filter((account) => !skipped.has(account.key));
    // 스스로 도는 바퀴(자동 운전)는 자동으로 표시한다 — 자동 로그인 재시도 간격이 그 표시를 본다.
    const batch = await collectAll(targetAccounts, {
      selectionMode: options.automatic ? 'automatic' : 'manual',
    });
    await generatedFileWriteQueueRef.current;
    const notice = orderCollectionBatchNotice({
      ...batch,
      skippedCount: latestAccounts.length - targetAccounts.length,
    });
    if (notice.tone === 'warning') toast.warning(notice.message);
    else toast.success(notice.message);

    try {
      const [history, snapshot] = await Promise.all([
        loadGeneratedOrderFiles(),
        collectSellpiaOrderSnapshot(),
      ]);
      const reconciled = reconcileCollectedOrdersWithSellpia({
        history,
        sellpiaRows: snapshot.rows,
        collectionDate: todayYmd(),
        partial: snapshot.partial,
        checkedAt: Date.now(),
      });
      // 부분 조회는 "안 올라간 주문"과 "못 본 주문"을 가를 수 없어 숫자를 내지 않는다(KID-163).
      if (reconciled.missingTotal === null) {
        toast.warning(SELLPIA_RECONCILE_PARTIAL_MESSAGE);
      } else if (reconciled.missingTotal > 0) {
        toast.warning(`셀피아 대조: 아직 안 올라간 주문 ${formatNumber(reconciled.missingTotal)}건`);
      }
    } catch (error) {
      toast.error(friendlyError(error, '셀피아 대조에 실패했습니다.'));
    }
  }, [collectAll, mallAccountsLoading, refetchMallAccounts]);

  return { collectAllOrders };
}
