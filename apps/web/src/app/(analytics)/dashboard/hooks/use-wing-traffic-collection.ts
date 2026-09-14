'use client';

import { closedMonthRangeFromCutoff, shiftBusinessDateKey } from '@kiditem/shared/common';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { wingTrafficCollection, type WingTrafficRange } from '../lib/wing-traffic-collection';

export type DashboardPeriod = 'month' | 'week' | 'day' | 'custom';

export type WingTrafficCollectionRange = WingTrafficRange & Readonly<{
  source: 'dashboard-period' | 'selected-custom-range' | 'default-seven-days';
}>;

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

function sameRange(left: WingTrafficRange, right: WingTrafficRange): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

/**
 * The dashboard's Wing traffic control: the shared collection control plus the
 * range the selected dashboard period asks for. A running attempt keeps its
 * own range; a different selection is shown beside it and is not started.
 */
export function useWingTrafficCollection({
  period,
  selectedFrom,
  selectedTo,
}: {
  period: DashboardPeriod;
  selectedFrom?: string;
  selectedTo?: string;
}) {
  const control = useCollectionSourceControl(wingTrafficCollection);
  const knownThrough = control.status?.knownThrough;
  const range = knownThrough
    ? resolveWingTrafficCollectionRange({ period, selectedFrom, selectedTo, knownThrough })
    : null;
  const latestAttempt = control.status?.latestAttempt ?? null;
  const activeRange = latestAttempt?.state === 'RUNNING' ? latestAttempt.plan : null;
  const startBlockedReason = control.status === undefined
    ? null
    : period === 'custom' && (!selectedFrom || !selectedTo)
      ? '시작일과 종료일을 모두 입력해 주세요.'
      : range === null
        ? '수집할 기간이 없습니다.'
        : null;

  return {
    control,
    range,
    latestAttempt,
    latestComplete: control.status?.latestComplete ?? null,
    activeRange,
    activeRangeMatches: activeRange !== null && range !== null && sameRange(activeRange, range),
    startBlockedReason,
    collect: () => {
      if (!range || startBlockedReason) return;
      control.start({ startDate: range.startDate, endDate: range.endDate });
    },
  };
}
