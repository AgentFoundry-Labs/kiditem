import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  COUPANG_CATALOG_COLLECTOR_VERSION,
  type CoupangCatalogCollectionRun,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { toast } from 'sonner';
import {
  detectRankExtensionGate,
  rankExtensionGateMessage,
  runWingSalesRankCheck,
} from '@/app/(advertising)/rank-tracking/lib/rank-extension';
import { useAuthSession } from '@/components/providers/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { apiClient } from '@/lib/api-client';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { startCoupangCatalogBrowser } from '@/lib/coupang-catalog-extension';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { collectSellpiaSaleSummaryFromExtension } from '@/lib/sellpia-sales-collection';
import {
  ingestSellpiaSales,
  sellpiaSalesErrorMessage,
} from '@/lib/sellpia-sales-api';
import {
  readinessCollectionProducer,
  runReadinessExtensionCollection,
} from './readiness-extension-collection';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';

interface UseReadinessCollectionOptions {
  refetchReadiness: () => Promise<unknown>;
}

interface ChannelAccountOption {
  id: string;
  channel: string;
  isPrimary?: boolean | null;
}

interface BackgroundReadinessRun {
  runId: string;
  checkKey: 'coupang_products' | 'wing_kpi';
  producer: 'channels.coupang_catalog' | 'advertising.wing_rank';
}

function makeRunId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('이 브라우저는 안전한 수집 실행 ID 생성을 지원하지 않습니다.');
  }
  return crypto.randomUUID();
}

function announceSession(session: BrowserCollectionSessionView) {
  if (session.status === 'succeeded') {
    toast.success(`${session.progress.completed}/${session.progress.total}개 수집 완료`);
  } else if (session.status === 'attention_required') {
    toast.warning(session.attention?.message ?? '브라우저 확인이 필요합니다.');
  } else if (session.status === 'cancelled') {
    toast.info('브라우저 수집이 중단되었습니다.');
  } else if (session.status === 'failed') {
    toast.error(session.progress.label ?? '브라우저 수집에 실패했습니다.');
  }
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
}: UseReadinessCollectionOptions) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [activeSession, setActiveSession] =
    useState<BrowserCollectionSessionView | null>(null);
  const [backgroundRun, setBackgroundRun] =
    useState<BackgroundReadinessRun | null>(null);
  const settledBackgroundRunIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { session: authSession } = useAuthSession();
  const backgroundSessionQuery = useBrowserCollectionSession(
    backgroundRun?.runId ?? null,
  );
  const backgroundSession =
    backgroundRun && backgroundSessionQuery.data?.producer === backgroundRun.producer
      ? backgroundSessionQuery.data
      : null;

  const invalidateCollectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
    ]);
  };

  const handleServerCollect = async (check: ReadinessCheck) => {
    if (!check.collectEndpoint) return;
    setPendingKey(check.key);
    try {
      await apiClient.post(check.collectEndpoint, {});
      toast.success('수집 완료');
      await invalidateCollectedData();
      await refetchReadiness();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수집 실패');
    } finally {
      setPendingKey(null);
    }
  };

  useEffect(() => {
    if (!backgroundRun || !backgroundSession) return;
    setActiveSession(backgroundSession);
    if (
      backgroundSession.status === 'running' ||
      backgroundSession.status === 'attention_required'
    ) {
      return;
    }
    if (settledBackgroundRunIdRef.current === backgroundSession.runId) return;
    settledBackgroundRunIdRef.current = backgroundSession.runId;
    announceSession(backgroundSession);
    setPendingKey((current) =>
      current === backgroundRun.checkKey ? null : current,
    );
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
    ]).then(() => refetchReadiness());
  }, [backgroundRun, backgroundSession, queryClient, refetchReadiness]);

  const runExtensionCollection = async (
    check: ReadinessCheck,
    producer: NonNullable<ReturnType<typeof readinessCollectionProducer>>,
    extensionId: string,
    requestedRunId?: string,
  ) => {
    const runId = requestedRunId ?? makeRunId();
    setActiveSession(null);
    const session = await runReadinessExtensionCollection({
      check,
      producer,
      extensionId,
      runId,
      onSession: setActiveSession,
    });
    announceSession(session);
    return session;
  };

  const handleCollect = async (
    check: ReadinessCheck,
    requestedRunId?: string,
  ) => {
    if (check.collector === 'server') {
      await handleServerCollect(check);
      return;
    }

    // 일별 매출(wing_sales) 수집은 셀피아 판매현황 수집으로 대체한다.
    // (원래 Wing 브라우저 수집 로직은 코드에 그대로 남겨두고 여기서만 우회.)
    // 셀피아 몰별 일별 매출을 수집·적재해 비어있는 날짜를 채운다.
    if (check.key === 'wing_sales') {
      setPendingKey(check.key);
      try {
        const organizationId = user?.organizationId;
        if (!organizationId) {
          throw new Error('판매현황을 저장할 조직 정보가 없습니다. 다시 로그인해주세요.');
        }
        const collectionRange = sellpiaCollectionRange(check);
        const payload = await collectSellpiaSaleSummaryFromExtension({
          ...(collectionRange ?? {}),
          organizationId,
        });
        const result = await ingestSellpiaSales(payload);
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

    if (check.key === 'coupang_products') {
      setPendingKey(check.key);
      setActiveSession(null);
      settledBackgroundRunIdRef.current = null;
      try {
        if (!authSession?.access_token) {
          throw new Error('로그인 세션을 확인할 수 없습니다.');
        }
        const accounts = await apiClient.get<ChannelAccountOption[]>(
          '/api/channels/accounts',
        );
        const coupangAccounts = accounts.filter(
          (account) => account.channel === 'coupang',
        );
        const account =
          coupangAccounts.find((candidate) => candidate.isPrimary === true) ??
          coupangAccounts[0];
        if (!account) {
          throw new Error('활성 쿠팡 채널 계정을 찾을 수 없습니다.');
        }
        const run = await apiClient.post<CoupangCatalogCollectionRun>(
          `/api/channels/accounts/${encodeURIComponent(account.id)}` +
            '/catalog-imports/coupang-wing/runs',
          {
            clientRunKey: makeRunId(),
            collectorVersion: COUPANG_CATALOG_COLLECTOR_VERSION,
          },
        );
        await startCoupangCatalogBrowser({
          channelAccountId: account.id,
          runId: run.id,
          accessToken: authSession.access_token,
        });
        setBackgroundRun({
          runId: run.id,
          checkKey: 'coupang_products',
          producer: 'channels.coupang_catalog',
        });
        toast.info('쿠팡 전체 상품 수집을 백그라운드에서 시작했습니다.');
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : '쿠팡 상품 수집 시작 실패',
        );
        setPendingKey(null);
      }
      return;
    }

    if (check.key === 'wing_kpi') {
      const producer = readinessCollectionProducer(check.key);
      if (producer !== 'advertising.wing_rank') {
        toast.error('지원하지 않는 브라우저 수집 항목입니다.');
        return;
      }

      setPendingKey(check.key);
      setActiveSession(null);
      settledBackgroundRunIdRef.current = null;
      try {
        const gate = await detectRankExtensionGate();
        if (gate.status !== 'ready') {
          if (gate.status === 'missing' || gate.status === 'chrome_required') {
            await recordMissingBrowserCollection(
              producer,
              { checkKey: check.key, trigger: 'readiness' },
              requestedRunId,
            );
          }
          const message =
            rankExtensionGateMessage(gate) ??
            'Wing 판매순위 수집 확장프로그램을 확인할 수 없습니다.';
          if (gate.status === 'outdated') toast.error(message);
          else toast.warning(message);
          setPendingKey(null);
          return;
        }

        const runId = requestedRunId ?? makeRunId();
        const result = await runWingSalesRankCheck(gate.extensionId, runId);
        if (!result.started) {
          toast.info('순위를 확인할 자사 상품이 없습니다.');
          setPendingKey(null);
          return;
        }
        setBackgroundRun({
          runId: result.runId ?? runId,
          checkKey: 'wing_kpi',
          producer: 'advertising.wing_rank',
        });
        toast.info(
          `자사 상품 ${result.productTotal ?? 0}개의 Wing 판매순위 수집을 시작했습니다.`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Wing 판매순위 일괄 확인 시작 실패',
        );
        setPendingKey(null);
      }
      return;
    }

    const producer = readinessCollectionProducer(check.key);
    if (!producer) {
      toast.error('지원하지 않는 브라우저 수집 항목입니다.');
      return;
    }
    if (!check.scrapeUrls?.length) {
      toast.error('수집 URL 없음');
      return;
    }

    setPendingKey(check.key);

    try {
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        await recordMissingBrowserCollection(producer, {
          checkKey: check.key,
          trigger: 'readiness',
        }, requestedRunId);
        toast.warning('브라우저 수집 익스텐션을 찾을 수 없습니다.');
        return;
      }

      const session = await runExtensionCollection(
        check,
        producer,
        extensionId,
        requestedRunId,
      );

      await invalidateCollectedData();
      await refetchReadiness();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '브라우저 수집 실패');
    } finally {
      setPendingKey(null);
    }
  };

  return { pendingKey, activeSession, handleCollect };
}
