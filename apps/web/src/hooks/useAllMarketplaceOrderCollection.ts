'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { createBrowserMallCollector } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import { isDuplicateGeneratedFile } from '@/app/(orders)/order-collection/lib/generated-file-dedup';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from '@/app/(orders)/order-collection/lib/order-generated-file-store';
import { runWithConcurrency } from '@/app/(orders)/order-collection/lib/order-collection-concurrency';
import { type OrderCollectionExtensionRun } from '@/app/(orders)/order-collection/lib/order-collection-extension';
import {
  coupangDirectshipCollectionSource,
  type CoupangDirectshipHandoff,
} from '@/app/(orders)/order-collection/lib/coupang-directship-collection-source';
import {
  mallOrderCollectionSource,
  type MallOrderCollectionHandoff,
  type MallOrderCollectionStartInput,
} from '@/app/(orders)/order-collection/lib/mall-order-collection-source';
import {
  startCollectionSource,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { useAuth } from '@/hooks/useAuth';
import {
  classifyOrderCollectionFailure,
  COUPANG_DIRECT_MALL_KEY,
  isBrowserCollectableMall,
  mallCollectionFailureMessage,
  orderCollectionBatchNotice,
  todayYmd,
  type ConversionHistoryItem,
} from '@/app/(orders)/order-collection/lib/order-collection-page-model';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from '@/app/(orders)/order-collection/lib/order-mall-account-api';
import {
  collectSellpiaOrderSnapshot,
  reconcileCollectedOrdersWithSellpia,
  SELLPIA_RECONCILE_PARTIAL_MESSAGE,
} from '@/app/(orders)/order-collection/lib/sellpia-order-reconcile';
import { useOrderCollectionSessionControls } from '@/app/(orders)/order-collection/hooks/use-order-collection-session-controls';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import type { BrowserMallCollectionResult } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import type { CoupangDirectData } from '@/app/(orders)/order-collection/lib/coupang-directship-api';

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

export type MarketplaceOrderCollectionBatchResult = {
  successCount: number;
  failedCount: number;
  /** Malls the owner was already collecting, so this batch opened nothing for them. */
  inProgressCount: number;
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
    () => createBrowserMallCollector({
      mallAccounts,
      rocketChannelAccountId,
      addGeneratedFile,
      setPreviewId,
    }),
    [addGeneratedFile, mallAccounts, rocketChannelAccountId, setPreviewId],
  );

  const collectAccount = useCallback(
    async (
      account: OrderCollectionMallAccount,
      run: OrderCollectionExtensionRun,
      directship?: { eddDates: string[]; data?: CoupangDirectData },
    ) => {
      const activeRun = run;
      try {
        const collected = await collectBrowserMall(account, activeRun, { directship });
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
        const message = mallCollectionFailureMessage(
          account.name,
          friendlyError(error) ?? '브라우저 수집 실패',
        );
        const failureKind = classifyOrderCollectionFailure(error, message);
        const attentionKind = failureKind === 'auth' || failureKind === 'login'
          ? failureKind
          : null;
        const noNewOrders = !stopped && failureKind === 'empty';
        const ownerReconciliationRequired = error instanceof Error &&
          'ownerReconciliationRequired' in error &&
          (error as Error & { ownerReconciliationRequired?: unknown }).ownerReconciliationRequired === true;
        if (activeRun && attentionKind) {
          await syncRun(activeRun.attemptId).catch((syncError) => {
            console.warn(
              '[order-collection] failed to sync source attempt',
              syncError,
            );
          });
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
        if (activeRun) releaseRun(account.key, activeRun.attemptId);
      }
    },
    [
      clearMallErrorActivity,
      collectBrowserMall,
      failRun,
      logActivity,
      releaseRun,
      syncRun,
    ],
  );

  /**
   * Keeps the collection a hand-off left running, so a batch can wait for it,
   * and tells the operator how the one mall they started ended. A collection
   * the operator stopped is not a failure.
   */
  const startCollectionProcedure = useCallback((
    account: OrderCollectionMallAccount,
    run: OrderCollectionExtensionRun,
    collection: Promise<BrowserMallCollectionResult>,
    report: boolean,
  ) => {
    collectionsRef.current.set(account.key, collection);
    collection.then(
      (collected) => {
        if (!report) return;
        if (collected.masked) toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
        if (collected.rowCount > 0) toast.success(`${account.name} 수집 완료`);
      },
      (error: unknown) => {
        if (!report) return;
        if (run.signal?.aborted) {
          toast.info(COLLECTION_STOPPED_MESSAGE);
          return;
        }
        toast.error(mallCollectionFailureMessage(
          account.name,
          friendlyError(error) ?? '브라우저 수집 실패',
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
    startCollectionProcedure(account, run, collectAccount(account, run), report);
    return Promise.resolve();
  }, [activateOwnerRun, collectAccount, startCollectionProcedure]);

  const handOffDirectship = useCallback((
    account: OrderCollectionMallAccount,
    { extensionId, attempt }: CoupangDirectshipHandoff,
    report: boolean,
  ) => {
    const run = activateDirectOwnerRun(account, attempt, extensionId);
    startCollectionProcedure(account, run, collectAccount(account, run), report);
    return Promise.resolve();
  }, [activateDirectOwnerRun, collectAccount, startCollectionProcedure]);

  /**
   * One mall's adapter for the shared control. The card that renders it starts,
   * shows and stops the same collection every other browser sees.
   */
  const collectionAdapter = useCallback((
    account: OrderCollectionMallAccount,
    report = true,
  ): CollectionSourceAdapter<OrderCollectionSourceStatus, MallOrderCollectionStartInput> => (
    account.key === COUPANG_DIRECT_MALL_KEY
      ? coupangDirectshipCollectionSource({
        channelAccountId: rocketChannelAccountId,
        handOff: (handoff) => handOffDirectship(account, handoff, report),
        abortLocalRun,
      }) as CollectionSourceAdapter<OrderCollectionSourceStatus, MallOrderCollectionStartInput>
      : mallOrderCollectionSource({
        organizationId,
        account,
        handOff: (handoff) => handOffMall(account, handoff, report),
        abortLocalRun,
      })
  ), [abortLocalRun, handOffDirectship, handOffMall, organizationId, rocketChannelAccountId]);

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
    const outcome = await startCollectionSource(
      queryClient,
      collectionAdapter(account, false),
      input,
    );
    return {
      outcome,
      collection: outcome.outcome === 'started'
        ? collectionsRef.current.get(account.key) ?? null
        : null,
    };
  }, [collectionAdapter, queryClient]);

  const collectAccounts = useCallback(async (
    accounts: OrderCollectionMallAccount[],
  ): Promise<MarketplaceOrderCollectionBatchResult> => {
    if (accounts.length === 0) {
      return { successCount: 0, failedCount: 0, inProgressCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    await runWithConcurrency(accounts, COLLECT_ALL_CONCURRENCY, async (account) => {
      let started: Awaited<ReturnType<typeof startMall>>;
      try {
        // Every mall is admitted by its source owner through the shared start
        // control before extension detection or provider I/O.
        started = await startMall(account);
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
    return { successCount, failedCount, inProgressCount };
  }, [startMall]);

  const collectAll = useCallback((
    sourceAccounts: OrderCollectionMallAccount[] = mallAccounts,
  ): Promise<MarketplaceOrderCollectionBatchResult> => (
    collectAccounts(sourceAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    ))
  ), [collectAccounts, mallAccounts]);

  return {
    collectAccount,
    collectAccounts,
    collectAll,
    collectionAdapter,
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
  const mallAccounts = mallAccountsQuery.data ?? EMPTY_MALL_ACCOUNTS;
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

  const collectAllOrders = useCallback(async () => {
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

    const batch = await collectAll(latestAccounts);
    await generatedFileWriteQueueRef.current;
    const notice = orderCollectionBatchNotice(batch);
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
      toast.error(error instanceof Error ? error.message : '셀피아 대조에 실패했습니다.');
    }
  }, [collectAll, mallAccountsLoading, refetchMallAccounts]);

  return { collectAllOrders };
}
