'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { createBrowserMallCollector } from '@/app/(orders)/order-collection/lib/browser-mall-collection';
import { isDuplicateGeneratedFile } from '@/app/(orders)/order-collection/lib/generated-file-dedup';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from '@/app/(orders)/order-collection/lib/order-generated-file-store';
import { runWithConcurrency } from '@/app/(orders)/order-collection/lib/order-collection-concurrency';
import {
  OrderCollectionExtensionUnavailableError,
  type OrderCollectionExtensionRun,
} from '@/app/(orders)/order-collection/lib/order-collection-extension';
import type { ExtensionRuntimeStatus } from '@/lib/extension-bridge';
import {
  classifyOrderCollectionFailure,
  isBrowserCollectableMall,
  mallCollectionFailureMessage,
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
} from '@/app/(orders)/order-collection/lib/sellpia-order-reconcile';
import { useOrderCollectionSessionControls } from '@/app/(orders)/order-collection/hooks/use-order-collection-session-controls';
import type { CoupangDirectData } from '@/app/(orders)/order-collection/lib/coupang-directship-api';

const COLLECT_ALL_CONCURRENCY = 4;
const NOOP = () => undefined;
const NOOP_COLLECTING = (_mallKey: string, _collecting: boolean) => undefined;
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
};

type UseAllMarketplaceOrderCollectionOptions = {
  mallAccounts: OrderCollectionMallAccount[];
  rocketChannelAccountId: string | null;
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  setPreviewId?: (id: string) => void;
  markCollecting?: (mallKey: string, collecting: boolean) => void;
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
  markCollecting = NOOP_COLLECTING,
  clearMallErrorActivity = NOOP,
  logActivity = NOOP_ACTIVITY,
}: UseAllMarketplaceOrderCollectionOptions) {
  const sessionControls = useOrderCollectionSessionControls(
    mallAccounts,
    rocketChannelAccountId,
  );
  const {
    failRun,
    prepareRun,
    releaseRun,
    syncRun,
  } = sessionControls;
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
      run?: OrderCollectionExtensionRun,
      directship?: { eddDates: string[]; data?: CoupangDirectData },
      knownExtensionStatus?: ExtensionRuntimeStatus,
    ) => {
      markCollecting(account.key, true);
      let activeRun = run;
      try {
        if (!activeRun) {
          activeRun = await prepareRun(account, undefined, knownExtensionStatus) ?? undefined;
        }
        if (!activeRun) {
          throw new OrderCollectionExtensionUnavailableError('주문수집 확장프로그램을 찾을 수 없습니다.');
        }
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
        const message = mallCollectionFailureMessage(
          account.name,
          friendlyError(error) ?? '브라우저 수집 실패',
        );
        const failureKind = classifyOrderCollectionFailure(error, message);
        const attentionKind = failureKind === 'auth' || failureKind === 'login'
          ? failureKind
          : null;
        const noNewOrders = !activeRun?.signal?.aborted && failureKind === 'empty';
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
        if (activeRun && !attentionKind && !ownerReconciliationRequired) {
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
        if (!activeRun?.signal?.aborted) {
          logActivity(attentionKind ?? 'error', account.name, message);
        }
        throw error;
      } finally {
        if (activeRun) releaseRun(account.key, activeRun.attemptId);
        markCollecting(account.key, false);
      }
    },
    [
      clearMallErrorActivity,
      collectBrowserMall,
      failRun,
      logActivity,
      markCollecting,
      prepareRun,
      releaseRun,
      syncRun,
    ],
  );

  const collectAccounts = useCallback(async (
    accounts: OrderCollectionMallAccount[],
  ): Promise<MarketplaceOrderCollectionBatchResult> => {
    if (accounts.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;
    await runWithConcurrency(accounts, COLLECT_ALL_CONCURRENCY, async (account) => {
      try {
        // Each account is admitted by the source owner before extension
        // detection/provider I/O. The owner idempotency key, not a generic
        // browser run, is the batch's execution authority.
        await collectAccount(account);
        successCount += 1;
      } catch {
        failedCount += 1;
      }
    });
    return { successCount, failedCount };
  }, [collectAccount]);

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

    const { successCount, failedCount } = await collectAll(latestAccounts);
    await generatedFileWriteQueueRef.current;
    if (failedCount > 0) {
      toast.warning(
        `전체 수집 ${formatNumber(successCount)}개 성공, ${formatNumber(failedCount)}개 실패`,
      );
    } else {
      toast.success('전체 수집 완료');
    }

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
      const missing = [...reconciled.missingCountByMallKey.values()]
        .reduce((sum, count) => sum + count, 0);
      if (missing > 0) {
        toast.warning(`셀피아 대조: 아직 안 올라간 주문 ${formatNumber(missing)}건`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '셀피아 대조에 실패했습니다.');
    }
  }, [collectAll, mallAccountsLoading, refetchMallAccounts]);

  return { collectAllOrders };
}
