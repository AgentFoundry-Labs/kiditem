'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  type OrderCollectionExtensionRun,
} from '@/app/(orders)/order-collection/lib/order-collection-extension';
import { EXTENSION_TIMEOUT_MESSAGE, type ExtensionRuntimeStatus } from '@/lib/extension-bridge';
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
import {
  collectedOutcome,
  failedCollectionOutcome,
  type OrderCollectionOutcome,
} from '@/app/(orders)/order-collection/lib/order-collection-outcome';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';

const COLLECT_ALL_CONCURRENCY = 4;
/**
 * 한 바퀴에서 다시 물어볼 몰의 최대 수. 답이 없는 것은 대개 확장이 바쁘다는 뜻이라,
 * 전부 다시 돌리면 바쁜 확장을 더 밀어붙여 같은 실패를 부른다.
 */
const RECHECK_LIMIT = 3;
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
  /**
   * 확장이 제 시간에 답하지 않아 결과를 모르는 몰. 몰이 실패한 게 아니라 못 들은 것이라,
   * 부르는 쪽이 딱 한 번 더 물어볼 수 있게 이름만 돌려준다.
   */
  noAnswerMallKeys: string[];
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
  // 수집 결과(기억)를 남긴 직후 화면이 다시 읽도록 무효화한다.
  const queryClient = useQueryClient();
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
      // 이 수집 한 번의 결과. finally 에서 한 줄로 남긴다(쇼핑몰 에이전트의 기억).
      let outcome: OrderCollectionOutcome | null = null;
      try {
        if (!activeRun) {
          activeRun = await prepareRun(account, undefined, knownExtensionStatus) ?? undefined;
        }
        if (!activeRun) {
          throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
        }
        const collected = await collectBrowserMall(account, activeRun, { directship });
        if (collected.rowCount === 0) {
          // Empty provider results have no converter response to fence. Keep
          // the generic owner terminal instead of leaving a RUNNING attempt
          // forever. Directship is already COMPLETE before this downstream
          // probe, so it must remain a successful no-op rather than issuing
          // a terminal failure against the completed source owner.
          if (activeRun.sourceOwner !== 'coupang_directship') {
            await failRun(
              activeRun,
              'NO_NEW_ORDERS',
              `${account.name} 배송준비전 주문이 없습니다.`,
            );
          }
        } else {
          // Server conversion endpoints complete the source owner after the
          // transient download is produced. Read the owner projection back;
          // generated output bytes never become a web/server artifact.
          await syncRun(activeRun.attemptId);
        }
        outcome = collectedOutcome(account.key, collected.rowCount);
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
        outcome = failedCollectionOutcome({
          error,
          message,
          attentionKind,
          noNewOrders,
          aborted: Boolean(activeRun?.signal?.aborted),
          hasRun: Boolean(activeRun),
        });
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
        if (outcome) {
          // 한 번의 수집에 정확히 한 줄. 기록 실패는 수집을 막지 않는다.
          void recordMallOperationOutcome({
            mallKey: account.key,
            operation: 'order_collection',
            ...outcome,
            runId: activeRun?.attemptId ?? null,
          }).finally(() => {
            // 기록이 남는 즉시 화면이 다시 읽게 한다. 이게 없으면 몰 카드와 몰별 상태가 최대
            // 1분 늦게 따라와, 방금 성공한 수집이 직전 실패로 보인다.
            void queryClient.invalidateQueries({
              queryKey: queryKeys.mallOperationOutcomes.all,
            });
          });
        }
      }
    },
    [
      clearMallErrorActivity,
      collectBrowserMall,
      failRun,
      logActivity,
      queryClient,
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
      return { successCount: 0, failedCount: 0, noAnswerMallKeys: [] };
    }

    let successCount = 0;
    let failedCount = 0;
    const noAnswerMallKeys: string[] = [];
    await runWithConcurrency(accounts, COLLECT_ALL_CONCURRENCY, async (account) => {
      try {
        // Each account is admitted by the source owner before extension
        // detection/provider I/O. The owner idempotency key, not a generic
        // browser run, is the batch's execution authority.
        await collectAccount(account);
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        if (error instanceof Error && error.message === EXTENSION_TIMEOUT_MESSAGE) {
          noAnswerMallKeys.push(account.key);
        }
      }
    });
    return { successCount, failedCount, noAnswerMallKeys };
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
  const collectAllOrders = useCallback(async (skipMallKeys: readonly string[] = []) => {
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
    const targetAccounts = skipped.size === 0
      ? latestAccounts
      : latestAccounts.filter((account) => !skipped.has(account.key));
    const skippedCount = latestAccounts.length - targetAccounts.length;

    const first = await collectAll(targetAccounts);
    let successCount = first.successCount;
    let failedCount = first.failedCount;

    // 답을 못 받은 몰만 딱 한 번 더 물어본다. 몰이 실패한 게 아니라 확장이 바빠 못 들은
    // 것이므로, 한 번 더 물으면 대개 답한다. 재확인은 **한 번뿐**이다 — 재확인 결과로 다시
    // 재확인하지 않으므로 구조상 무한루프가 될 수 없다. 한 번 더 물어도 답이 없으면 거기서
    // 멈추고 '응답 없음'으로 남긴다.
    const recheckKeys = first.noAnswerMallKeys.slice(0, RECHECK_LIMIT);
    if (recheckKeys.length > 0) {
      const recheckAccounts = targetAccounts.filter((account) => recheckKeys.includes(account.key));
      const again = await collectAll(recheckAccounts);
      successCount += again.successCount;
      failedCount += again.failedCount - recheckAccounts.length;
    }

    await generatedFileWriteQueueRef.current;
    const skippedNote = skippedCount > 0 ? `, ${formatNumber(skippedCount)}개 건너뜀(직접 로그인 필요)` : '';
    const recheckNote = recheckKeys.length > 0 ? `, ${formatNumber(recheckKeys.length)}개 다시 확인` : '';
    if (failedCount > 0) {
      toast.warning(
        `전체 수집 ${formatNumber(successCount)}개 성공, ${formatNumber(failedCount)}개 실패${recheckNote}${skippedNote}`,
      );
    } else {
      toast.success(`전체 수집 완료${recheckNote}${skippedNote}`);
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
