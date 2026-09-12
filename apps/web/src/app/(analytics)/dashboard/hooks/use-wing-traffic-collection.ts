'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelWingTrafficSource,
  collectWingTrafficSource,
  readWingTrafficSource,
  WingTrafficRangeMismatchError,
} from '../lib/wing-traffic-source-owner';
import type {
  AdTrafficSourceBegin,
  AdTrafficSourceAttempt,
  AdTrafficSourceStatus,
} from '@kiditem/shared/advertising';
import { closedMonthRangeFromCutoff, shiftBusinessDateKey } from '@kiditem/shared/common';


export type DashboardPeriod = 'month' | 'week' | 'day' | 'custom';

export type WingTrafficCollectionRange = Readonly<{
  startDate: string;
  endDate: string;
  source: 'dashboard-period' | 'selected-custom-range' | 'default-seven-days';
}>;

export const wingTrafficSourceQueryKey = [
  ...queryKeys.dashboard.all,
  'wing-traffic-source',
] as const;

/**
 * Resolve the operator's intended collection range without using browser
 * locale dates. Custom dashboard dates are authoritative; the other tabs map
 * to bounded closed KST ranges that never include today's partial day.
 */
export function resolveWingTrafficCollectionRange({
  period = 'week',
  selectedFrom,
  selectedTo,
  knownThrough,
}: {
  period?: DashboardPeriod;
  selectedFrom?: string;
  selectedTo?: string;
  knownThrough: string;
}): WingTrafficCollectionRange | null {

  if (period === 'custom' && selectedFrom && selectedTo) {
    return {
      startDate: selectedFrom,
      endDate: selectedTo,
      source: 'selected-custom-range',
    };
  }

  if (period === 'day') {
    return { startDate: knownThrough, endDate: knownThrough, source: 'dashboard-period' };
  }

  if (period === 'month') {
    const month = closedMonthRangeFromCutoff(knownThrough);
    if (!month) return null;
    return {
      startDate: month.from,
      endDate: month.to,
      source: 'dashboard-period',
    };
  }

  return {
    startDate: shiftBusinessDateKey(knownThrough, -6),
    endDate: knownThrough,
    source: period === 'week' ? 'dashboard-period' : 'default-seven-days',
  };
}

export function wingTrafficTargetUrl(range: Pick<WingTrafficCollectionRange, 'startDate' | 'endDate'>): string {
  const params = new URLSearchParams({
    start_date: range.startDate,
    end_date: range.endDate,
  });
  return `https://wing.coupang.com/tenants/business-insight/sales-analysis?${params.toString()}`;
}

function sameRange(
  left: Pick<WingTrafficCollectionRange, 'startDate' | 'endDate'>,
  right: Pick<WingTrafficCollectionRange, 'startDate' | 'endDate'>,
): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

export function formatWingTrafficRange(
  range: Pick<WingTrafficCollectionRange, 'startDate' | 'endDate'>,
): string {
  return `${range.startDate} ~ ${range.endDate}`;
}

export function useWingTrafficCollection({
  period,
  selectedFrom,
  selectedTo,
  channelAccountId,
}: {
  period: DashboardPeriod;
  selectedFrom?: string;
  selectedTo?: string;
  channelAccountId?: string;
}) {
  const queryClient = useQueryClient();
  const [actionPending, setActionPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const observedCompleteId = useRef<string | null | undefined>(undefined);
  const source = useQuery<AdTrafficSourceStatus>({
    queryKey: [...wingTrafficSourceQueryKey, channelAccountId ?? 'primary'],
    queryFn: () => readWingTrafficSource(channelAccountId),
    retry: false,
    refetchInterval: (query) =>
      actionPending || query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
  const knownThrough = source.data?.knownThrough;
  const range = knownThrough ? resolveWingTrafficCollectionRange({
    period,
    selectedFrom,
    selectedTo,
    knownThrough,
  }) : null;
  const rangeReady = source.isSuccess
    && range !== null
    && (period !== 'custom' || (!!selectedFrom && !!selectedTo));

  useEffect(() => {
    // The first render only starts the source read. Do not treat that
    // pre-response null as the observed completion baseline, or the first
    // existing COMPLETE payload would look like a newly completed run.
    if (!source.data) return;
    const completeId = source.data?.latestComplete?.attemptId ?? null;
    if (observedCompleteId.current === undefined) {
      // Establish a baseline from the first read; page entry is read-only.
      observedCompleteId.current = completeId;
      return;
    }
    if (!completeId || completeId === observedCompleteId.current) return;
    observedCompleteId.current = completeId;
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }, [queryClient, source.data?.latestComplete?.attemptId]);

  const latestAttempt = source.data?.latestAttempt ?? null;
  const activeRange = latestAttempt?.state === 'RUNNING'
    ? latestAttempt.plan
    : null;
  const activeRangeMatches = activeRange && range
    ? sameRange(activeRange, range)
    : false;
  const request: AdTrafficSourceBegin | null = range ? {
    ...(channelAccountId ? { channelAccountId } : {}),
    startDate: range.startDate,
    endDate: range.endDate,
    url: wingTrafficTargetUrl(range),
  } : null;

  const collect = useCallback(async (): Promise<AdTrafficSourceAttempt | null> => {
    if (actionPending || cancelPending) return null;
    if (!rangeReady || !range || !request) {
      setActionError(period === 'month' && knownThrough
        ? '이번 달에 마감된 영업일이 없습니다.'
        : '수집 가능한 시작일과 종료일을 확인해 주세요.');
      return null;
    }

    const observed = source.data?.latestAttempt;
    if (observed?.state === 'RUNNING' && !sameRange(observed.plan, range)) {
      const mismatch = new WingTrafficRangeMismatchError(observed.plan, range);
      setActionError(mismatch.message);
      return null;
    }

    setActionError(null);
    setActionPending(true);
    try {
      const attempt = await collectWingTrafficSource(request);
      await source.refetch();
      if (attempt.state === 'COMPLETE') {
        toast.success(`Wing 일별 트래픽 수집 완료 · ${formatWingTrafficRange(attempt.plan)}`);
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      } else if (attempt.state === 'FAILED') {
        const message = attempt.errorMessage ?? 'Wing 일별 트래픽 수집에 실패했습니다.';
        setActionError(message);
        toast.warning(message);
      } else {
        toast.info('Wing 일별 트래픽 수집이 아직 진행 중입니다. 같은 범위로 이어받을 수 있습니다.');
      }
      return attempt;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wing 일별 트래픽 수집 실패';
      setActionError(message);
      if (!(error instanceof WingTrafficRangeMismatchError)) toast.error(message);
      return null;
    } finally {
      setActionPending(false);
    }
  }, [actionPending, cancelPending, knownThrough, period, queryClient, range, rangeReady, request, source]);

  const cancel = useCallback(async (): Promise<AdTrafficSourceAttempt | null> => {
    if (cancelPending || actionPending) return null;
    const active = source.data?.latestAttempt;
    if (!active || active.state !== 'RUNNING') return null;

    setActionError(null);
    setCancelPending(true);
    try {
      const attempt = await cancelWingTrafficSource(active.attemptId, active.plan.parserVersion);
      await source.refetch();
      if (attempt.state === 'FAILED') {
        toast.info(attempt.errorMessage ?? 'Wing 일별 트래픽 수집을 중단했습니다.');
      }
      return attempt;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wing 일별 트래픽 중단 실패';
      setActionError(message);
      toast.error(message);
      return null;
    } finally {
      setCancelPending(false);
    }
  }, [actionPending, cancelPending, source]);

  return {
    source,
    refresh: source.refetch,
    range,
    rangeReady,
    request,
    latestAttempt,
    latestComplete: source.data?.latestComplete ?? null,
    activeRange,
    activeRangeMatches,
    actionPending,
    cancelPending,
    actionError,
    collect,
    cancel,
  };
}
