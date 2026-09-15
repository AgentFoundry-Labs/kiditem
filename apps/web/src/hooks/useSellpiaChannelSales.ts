'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { fetchSellpiaSalesSummary } from '@/lib/sellpia-sales-api';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import {
  closedMonthRangeFromCutoff,
  kstMonthEnd,
  shiftBusinessDateKey,
} from '@kiditem/shared/common';

// 대시보드 기간 선택(일/주/월/기간) → Sellpia 조회 from/to(KST) 계산.
// 일: 기준일 / 주: 최근 7일 / 월: 이번 달 1일~기준일 / 기간: 사용자 지정.
export function sellpiaPeriodRange(
  range: 'day' | 'week' | 'month' | 'custom',
  dateFrom: string,
  dateTo: string,
  knownThrough: string,
): { from: string; to: string } | null {
  if (range === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
  if (range === 'day') return { from: knownThrough, to: knownThrough };
  if (range === 'week') {
    return { from: shiftBusinessDateKey(knownThrough, -6), to: knownThrough };
  }
  return closedMonthRangeFromCutoff(knownThrough);
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// 매출분석 월 선택(YYYY-MM)을 Sellpia 일별 조회 범위로 변환한다.
// 현재 달력 월은 마감일까지, 지난 월은 월말까지 조회한다. 열린 월초·미래 월은 조회하지 않는다.
export function sellpiaMonthRange(
  period: string,
  knownThrough: string,
): { from: string; to: string } | null {
  const anchorMonth = shiftBusinessDateKey(knownThrough, 1).slice(0, 7);
  if (!YEAR_MONTH_PATTERN.test(period) || period > anchorMonth) return null;
  if (period === anchorMonth) {
    return closedMonthRangeFromCutoff(knownThrough);
  }
  return {
    from: `${period}-01`,
    to: kstMonthEnd(period),
  };
}

export interface SellpiaChannelSales {
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useSellpiaKnownThrough(): string | null {
  const { data } = useQuery({
    queryKey: [...queryKeys.dashboard.sellpiaSalesAll(), 'known-through'],
    queryFn: () => fetchSellpiaSalesSummary(),
    staleTime: 60_000,
  });
  return data?.knownThrough ?? null;
}

// Sellpia 판매현황(몰별 매출) 조회. 홈 월 매출 카드와 매출분석의 몰별 상세가
// 이 훅 하나를 공유한다(쿼리 dedupe). 조회는 선택 기간(from~to)별로 하고,
// 수집은 공유 수집 컨트롤(sellpia-sales-source-collection)이 맡는다.
export function useSellpiaChannelSales(range: {
  from: string;
  to: string;
} | null): SellpiaChannelSales {
  const from = range?.from;
  const to = range?.to;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard.sellpiaSales(from ?? 'pending', to ?? 'pending'),
    queryFn: () => fetchSellpiaSalesSummary({ from: from!, to: to! }),
    enabled: !!from && !!to,
    refetchInterval: 60_000,
  });

  return { summary: data, isLoading, isError, refetch };
}
