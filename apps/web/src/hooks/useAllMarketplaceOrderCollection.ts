'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import type { OrderCollectionExtensionRun } from '@/app/(orders)/order-collection/lib/order-collection-extension';
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
  const sessionControls = useOrderCollectionSessionControls(mallAccounts);
  const {
    finalizeRun,
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
      directship?: { eddDates: string[] },
    ) => {
      markCollecting(account.key, true);
      let activeRun = run;
      try {
        if (!activeRun) {
          activeRun = await prepareRun(account) ?? undefined;
        }
        if (!activeRun) {
          throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
        }
        const collected = await collectBrowserMall(account, activeRun, { directship });
        await finalizeRun(
          activeRun,
          'succeeded',
          collected.rowCount === 0
            ? `${account.name} 배송준비전 주문 없음`
            : `${account.name} 수집 및 파일 생성 완료 (${formatNumber(collected.rowCount)}행)`,
        );
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
        if (activeRun && attentionKind) {
          await syncRun(activeRun.runId).catch((syncError) => {
            console.warn(
              '[order-collection] failed to sync attention session',
              syncError,
            );
          });
        }
        if (activeRun && !attentionKind) {
          await finalizeRun(
            activeRun,
            noNewOrders ? 'succeeded' : 'failed',
            noNewOrders
              ? `${account.name} 신규 주문 없음`
              : `${account.name} 파일 생성 실패: ${message}`,
          ).catch((finalizeError) => {
            console.warn(
              '[order-collection] failed to finalize collection session',
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
        if (activeRun) releaseRun(account.key, activeRun.runId);
        markCollecting(account.key, false);
      }
    },
    [
      clearMallErrorActivity,
      collectBrowserMall,
      finalizeRun,
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
  const notifiedAttentionRef = useRef<string | null>(null);
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
    sessionControls,
  } = useAllMarketplaceOrderCollection({
    mallAccounts,
    rocketChannelAccountId,
    addGeneratedFile,
  });

  useEffect(() => {
    const session = sessionControls.session;
    const attentionMessage = session?.status === 'attention_required'
      ? session.attention?.message ?? null
      : null;
    if (!attentionMessage) {
      notifiedAttentionRef.current = null;
      return;
    }
    const signature = `${session?.runId ?? ''}:${attentionMessage}`;
    if (notifiedAttentionRef.current === signature) return;
    notifiedAttentionRef.current = signature;
    toast.warning(attentionMessage);
  }, [sessionControls.session]);

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
