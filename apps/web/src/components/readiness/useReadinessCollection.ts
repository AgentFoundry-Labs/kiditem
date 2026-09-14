import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CoupangCatalogBrowserStatus,
  type CoupangCatalogCollectionRun,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { toast } from 'sonner';
import {
  beginWingRankBatch,
  fetchWingRankBatch,
} from '@/app/(advertising)/rank-tracking/lib/rank-api';
import {
  detectRankExtensionGate,
  rankExtensionGateMessage,
  runWingSalesRankCheck,
} from '@/app/(advertising)/rank-tracking/lib/rank-extension';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { collectSellpiaSaleSummaryFromExtension } from '@/lib/sellpia-sales-collection';
import {
  readActiveCoupangCatalogAttempt,
  readActiveCoupangCatalogAttemptForStage,
  readCoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLink,
  type CoupangCatalogCollectionLinkResult,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { useCoupangCatalogImport } from '@/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport';
import { sellpiaSalesErrorMessage } from '@/lib/sellpia-sales-api';
import { useAdSync } from '@/app/(advertising)/ad-ops/hooks/useAdSync';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

interface UseReadinessCollectionOptions {
  refetchReadiness: () => Promise<unknown>;
  /** Disable catalog account/status reads while the readiness surface is closed. */
  catalogEnabled?: boolean;
  /** Reactive route handoff. `null` means this surface has no handoff query. */
  catalogLink?: CoupangCatalogCollectionLinkResult | null;
}

export interface ChannelAccountOption {
  id: string;
  channel: string;
  name?: string | null;
  isPrimary?: boolean | null;
}

export interface CatalogReadinessState {
  accounts: ChannelAccountOption[];
  accountsLoading: boolean;
  accountsError: unknown;
  accountId: string | null;
  accountLocked: boolean;
  setAccountId: (accountId: string | null) => void;
  linkError: string | null;
  owner: CoupangCatalogCollectionRun | null;
  chainOverallState: CoupangCatalogCollectionRun['overallState'] | null;
  browser: CoupangCatalogBrowserStatus | null;
  ownerLoading: boolean;
  ownerError: unknown;
  actionError: string | null;
  cancelError: string | null;
  isCancelling: boolean;
  cancel: () => Promise<void>;
  openAttention: () => Promise<void>;
}

function makeClientRunKey(): string {
  return createSecureRandomUuid();
}

function sellpiaCollectionRange(check: ReadinessCheck): {
  startDate: string;
  endDate: string;
} | undefined {
  const targetDates = check.missingDates?.length
    ? [...check.missingDates]
    : check.expectedDates?.length
      ? [check.expectedDates[0]!]
      : check.referenceDate
        ? [check.referenceDate]
        : [];
  const sorted = [...targetDates].sort();
  if (sorted.length === 0) return undefined;
  const nextReferenceDate = check.referenceDate
    ? new Date(`${check.referenceDate}T00:00:00.000Z`)
    : null;
  if (nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())) {
    nextReferenceDate.setUTCDate(nextReferenceDate.getUTCDate() + 1);
  }
  return {
    startDate: sorted[0]!,
    // readiness는 어제까지 판정하지만 홈의 월 누적 합계는 오늘까지 조회한다.
    endDate: nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())
      ? nextReferenceDate.toISOString().slice(0, 10)
      : sorted.at(-1)!,
  };
}

export function useReadinessCollection({
  refetchReadiness,
  catalogEnabled = false,
  catalogLink: catalogLinkOverride,
}: UseReadinessCollectionOptions) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [initialCatalogLink] = useState(() => readCoupangCatalogCollectionLink());
  const catalogLink = catalogLinkOverride === undefined
    ? initialCatalogLink
    : catalogLinkOverride;
  const validCatalogLink = catalogLink && !('invalid' in catalogLink)
    ? catalogLink as CoupangCatalogCollectionLink
    : null;
  const malformedCatalogLink = Boolean(catalogLink && 'invalid' in catalogLink);
  const catalogLinkKey = validCatalogLink
    ? `${validCatalogLink.attemptId}:${validCatalogLink.channelAccountId}:${validCatalogLink.stage}`
    : malformedCatalogLink
      ? 'invalid'
      : 'none';
  const [catalogAccountId, setCatalogAccountId] = useState<string | null>(
    () => validCatalogLink?.channelAccountId ??
      readActiveCoupangCatalogAttemptForStage('basics')?.channelAccountId ??
      readActiveCoupangCatalogAttempt()?.channelAccountId ?? null,
  );
  const [wingBatchKey, setWingBatchKey] = useState<string | null>(null);
  const [wingStarting, setWingStarting] = useState(false);
  const observedWingTerminals = useRef('');
  const queryClient = useQueryClient();
  const catalogAccountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.get<ChannelAccountOption[]>('/api/channels/accounts'),
    enabled: catalogEnabled,
    staleTime: 60_000,
    retry: false,
  });
  const catalogAccounts = (Array.isArray(catalogAccountsQuery.data)
    ? catalogAccountsQuery.data
    : []).filter((account) => account.channel === 'coupang');
  const linkedAccountKnown = Boolean(validCatalogLink &&
    catalogAccounts.some((account) => account.id === validCatalogLink.channelAccountId));
  const catalogLinkError = malformedCatalogLink
    ? '상품 받기 링크가 올바르지 않습니다. 링크를 확인한 뒤 다시 시도해주세요.'
    : validCatalogLink && catalogAccountsQuery.isFetched && !linkedAccountKnown
      ? '연결된 쿠팡 계정을 찾을 수 없습니다. 링크의 계정 권한을 확인해주세요.'
      : null;
  useEffect(() => {
    if (validCatalogLink) {
      setCatalogAccountId(validCatalogLink.channelAccountId);
      return;
    }
    if (catalogLinkOverride !== undefined) {
      const storedAccountId = readActiveCoupangCatalogAttemptForStage('basics')?.channelAccountId ??
        readActiveCoupangCatalogAttempt()?.channelAccountId ?? null;
      setCatalogAccountId(storedAccountId);
      return;
    }
    if (catalogAccountId && catalogAccounts.some((account) => account.id === catalogAccountId)) return;
    const preferred = catalogAccounts.find((account) => account.isPrimary === true) ?? catalogAccounts[0];
    if (preferred) setCatalogAccountId(preferred.id);
  }, [catalogAccountId, catalogAccounts, catalogLinkKey, catalogLinkOverride, validCatalogLink]);
  const catalogInputReady = !validCatalogLink ||
    (catalogAccountsQuery.isFetched && linkedAccountKnown);
  const catalogImportAccountId = validCatalogLink && linkedAccountKnown
    ? validCatalogLink.channelAccountId
    : validCatalogLink
      ? null
      : catalogAccountId;
  const catalogImport = useCoupangCatalogImport(
    catalogImportAccountId,
    validCatalogLink && linkedAccountKnown ? validCatalogLink.attemptId : null,
    validCatalogLink?.stage ?? 'basics',
    {
      enabled: catalogEnabled && catalogInputReady && !malformedCatalogLink,
      suppressStoredAttempt: Boolean(catalogLink),
      onSettled: async (owner, explicitlyStarted) => {
        setPendingKey((current) => current === 'coupang_products' ? null : current);
        if (explicitlyStarted) {
          const overallState = owner.overallState ?? owner.state;
          if (overallState === 'FAILED') {
            toast.error(
              `${owner.error?.message ?? '쿠팡 상품 수집에 실패했습니다.'} · 이전 정상 데이터는 유지됩니다.`,
            );
          } else {
            toast.success('쿠팡 전체 상품 수집 완료');
          }
        }
        await refetchReadiness();
      },
    },
  );
  useEffect(() => {
    const owner = catalogImport.chainStatus ?? catalogImport.serverStatus;
    const overallState = catalogImport.chainOverallState;
    if (catalogImport.isStarting || overallState === 'RUNNING') {
      setPendingKey((current) =>
        current === null || current === 'coupang_products' ? 'coupang_products' : current,
      );
    } else if (overallState && owner) {
      setPendingKey((current) => current === 'coupang_products' ? null : current);
    }
  }, [
    catalogImport.chainOverallState,
    catalogImport.chainStatus?.currentAttemptId,
    catalogImport.chainStatus?.currentStage,
    catalogImport.isStarting,
    catalogImport.serverStatus?.attemptId,
    catalogImport.serverStatus?.currentAttemptId,
    catalogImport.serverStatus?.currentStage,
    catalogImport.serverStatus?.overallState,
    catalogImport.serverStatus?.state,
  ]);
  const wingOwner = useQuery(collectionSourceStatusQueryOptions({
    queryKey: [...queryKeys.ads.keywordRank(), 'batch', wingBatchKey],
    queryFn: () => fetchWingRankBatch(wingBatchKey!),
    enabled: !!wingBatchKey && !wingStarting,
    refetchInterval: (query) =>
      !query.state.data || query.state.data.attempts.some((attempt) => attempt.state === 'RUNNING')
        ? 2000
        : false,
  }));
  // The coupang_ads check collects through the campaign sweep owner. Its
  // persisted latest attempt, not browser storage, says a sweep is running.
  const adSync = useAdSync();
  const adSyncBusy = adSync.loading || adSync.status?.state === 'RUNNING';
  const adSyncWasBusy = useRef(false);

  const invalidateCollectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
    ]);
  };

  useEffect(() => {
    if (wingOwner.isError) {
      toast.error('서버의 Wing 수집 결과를 확인하지 못했습니다.');
    }
  }, [wingOwner.isError]);

  useEffect(() => {
    if (wingStarting || !wingOwner.data) return;
    const attempts = wingOwner.data.attempts;
    const running = attempts.some((attempt) => attempt.state === 'RUNNING');
    setPendingKey((current) =>
      current === null || current === 'wing_kpi'
        ? running ? 'wing_kpi' : null
        : current,
    );
    const terminals = attempts.filter((attempt) => attempt.state !== 'RUNNING');
    const signature = terminals
      .map((attempt) => `${attempt.attemptId}:${attempt.state}`).join(',');
    if (!signature || signature === observedWingTerminals.current) return;
    observedWingTerminals.current = signature;
    const failures = terminals.filter((attempt) => attempt.state === 'FAILED');
    if (failures.length) {
      toast.error(
        `${failures.map((attempt) => `${attempt.keyword}: ${attempt.errorMessage ?? '수집 실패'}`).join(', ')} · 이전 정상 데이터는 유지됩니다.`,
      );
    } else if (!running) {
      toast.success(`${terminals.length}/${attempts.length}개 키워드 수집 완료`);
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
    ]).then(() => refetchReadiness());
  }, [wingStarting, wingOwner.data, queryClient, refetchReadiness]);

  useEffect(() => {
    if (!catalogImport.readError) return;
    toast.error('서버의 쿠팡 상품 수집 결과를 확인하지 못했습니다.');
  }, [catalogImport.readError]);

  useEffect(() => {
    if (adSyncBusy) {
      adSyncWasBusy.current = true;
      setPendingKey((current) =>
        current === null || current === 'coupang_ads' ? 'coupang_ads' : current,
      );
      return;
    }
    setPendingKey((current) => (current === 'coupang_ads' ? null : current));
    if (!adSyncWasBusy.current) return;
    // The sweep settled (explicit run or a reloaded RUNNING attempt): the
    // readiness check reads the campaign ledger it just published.
    adSyncWasBusy.current = false;
    void refetchReadiness();
  }, [adSyncBusy, refetchReadiness]);

  const handleCollect = async (
    check: ReadinessCheck,
  ) => {
    // 일별 매출(wing_sales) 수집은 셀피아 판매현황 수집으로 대체한다.
    // (원래 Wing 브라우저 수집 로직은 코드에 그대로 남겨두고 여기서만 우회.)
    // 셀피아 몰별 일별 매출을 수집·적재해 비어있는 날짜를 채운다.
    if (check.key === 'wing_sales') {
      setPendingKey(check.key);
      try {
        const collectionRange = sellpiaCollectionRange(check);
        const result = await collectSellpiaSaleSummaryFromExtension({
          ...(collectionRange ?? {}),
        });
        if (!result.success) {
          throw new Error(result.errorMessage ?? '셀피아 판매현황 수집에 실패했습니다.');
        }
        toast.success(`셀피아 판매현황 ${result.businessDates.length}일 수집 완료`);
        await invalidateCollectedData();
        await refetchReadiness();
      } catch (error) {
        toast.error(sellpiaSalesErrorMessage(error, '셀피아 판매현황 수집 실패'));
      } finally {
        setPendingKey(null);
      }
      return;
    }

    if (check.key === 'coupang_ads') {
      // The owner flow reports its own start, failure and completion.
      await adSync.run();
      return;
    }

    if (check.key === 'coupang_products') {
      if (catalogLinkError) {
        toast.error(catalogLinkError);
        return;
      }
      if (validCatalogLink && !linkedAccountKnown) {
        toast.error('연결된 쿠팡 계정을 확인하는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setPendingKey(check.key);
      try {
        let accounts = catalogAccounts;
        if (accounts.length === 0) {
          const refreshed = await catalogAccountsQuery.refetch();
          accounts = (Array.isArray(refreshed.data) ? refreshed.data : [])
            .filter((account) => account.channel === 'coupang');
        }
        const account = validCatalogLink
          ? accounts.find((candidate) => candidate.id === validCatalogLink.channelAccountId)
          : accounts.find((candidate) => candidate.id === catalogAccountId) ??
          accounts.find((candidate) => candidate.isPrimary === true) ??
          accounts[0];
        if (!account) throw new Error('활성 쿠팡 채널 계정을 찾을 수 없습니다.');
        setCatalogAccountId(account.id);
        await catalogImport.start(account.id);
        toast.info('쿠팡 상품 받기를 시작했습니다.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '쿠팡 상품 받기 시작 실패');
        setPendingKey(null);
      }
      return;
    }

    if (check.key === 'wing_kpi') {
      setPendingKey(check.key);
      setWingStarting(true);
      try {
        const gate = await detectRankExtensionGate();
        if (gate.status !== 'ready') {
          const message =
            rankExtensionGateMessage(gate) ??
            'Wing 판매순위 수집 확장프로그램을 확인할 수 없습니다.';
          if (gate.status === 'outdated') toast.error(message);
          else toast.warning(message);
          setPendingKey(null);
          return;
        }

        await transferExtensionAuthTo(gate.extensionId);
        const key = makeClientRunKey();
        setWingBatchKey(key);
        observedWingTerminals.current = '';
        const batch = await beginWingRankBatch(key);
        queryClient.setQueryData(
          [...queryKeys.ads.keywordRank(), 'batch', key], batch,
        );
        if (!batch.attempts.length) {
          setWingBatchKey(null);
          toast.info('순위를 확인할 자사 상품이 없습니다.');
          setPendingKey(null);
          return;
        }
        toast.info(
          `자사 상품 ${batch.selection.productCount}개의 Wing 판매순위 수집을 요청했습니다.`,
          {
            action: {
              label: '진행 보기',
              onClick: () => {
                window.open(`/rank-tracking?rankBatch=${key}`, '_blank', 'noopener,noreferrer');
              },
            },
          },
        );
        await runWingSalesRankCheck(gate.extensionId, key);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Wing 판매순위 일괄 확인 시작 실패',
        );
        setPendingKey(null);
      } finally {
        setWingStarting(false);
      }
      return;
    }

    toast.error('지원하지 않는 브라우저 수집 항목입니다.');
  };

  const catalog: CatalogReadinessState = {
    accounts: catalogAccounts,
    accountsLoading: catalogAccountsQuery.isLoading,
    accountsError: catalogAccountsQuery.error,
    accountId: catalogAccountId,
    accountLocked: Boolean(validCatalogLink),
    setAccountId: setCatalogAccountId,
    linkError: catalogLinkError,
    owner: catalogImport.chainStatus ?? catalogImport.serverStatus,
    chainOverallState: catalogImport.chainOverallState,
    browser: catalogImport.extensionStatus,
    ownerLoading: catalogImport.statusLoading,
    ownerError: catalogImport.readError,
    actionError: catalogImport.startError instanceof Error ? catalogImport.startError.message : null,
    cancelError: catalogImport.cancelError instanceof Error ? catalogImport.cancelError.message : null,
    isCancelling: catalogImport.isStopping,
    cancel: async () => {
      await catalogImport.cancel();
      toast.info('쿠팡 상품 받기를 중단했습니다.');
    },
    openAttention: async () => { await catalogImport.openAttention(); },
  };

  return { pendingKey, handleCollect, catalog };
}
