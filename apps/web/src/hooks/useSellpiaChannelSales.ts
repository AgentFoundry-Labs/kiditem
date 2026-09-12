'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchSellpiaSalesSummary,
  sellpiaSalesErrorMessage,
} from '@/lib/sellpia-sales-api';
import { collectSellpiaSaleSummaryFromExtension } from '@/lib/sellpia-sales-collection';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import { kstMonthEnd, shiftBusinessDateKey } from '@kiditem/shared/common';

// 대시보드 기간 선택(일/주/월/기간) → Sellpia 조회 from/to(KST) 계산.
// 일: 기준일 / 주: 최근 7일 / 월: 이번 달 1일~기준일 / 기간: 사용자 지정.
export function sellpiaPeriodRange(
  range: 'day' | 'week' | 'month' | 'custom',
  dateFrom: string,
  dateTo: string,
  knownThrough: string,
): { from: string; to: string } {
  if (range === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
  if (range === 'day') return { from: knownThrough, to: knownThrough };
  if (range === 'week') {
    return { from: shiftBusinessDateKey(knownThrough, -6), to: knownThrough };
  }
  return { from: `${knownThrough.slice(0, 7)}-01`, to: knownThrough };
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// 매출분석 월 선택(YYYY-MM)을 Sellpia 일별 조회 범위로 변환한다.
// 현재 월은 오늘까지만, 지난 월은 달의 마지막 날까지 조회한다.
export function sellpiaMonthRange(
  period: string,
  knownThrough: string,
): { from: string; to: string } {
  const normalizedPeriod = YEAR_MONTH_PATTERN.test(period)
    ? period
    : knownThrough.slice(0, 7);
  if (normalizedPeriod === knownThrough.slice(0, 7)) {
    return { from: `${normalizedPeriod}-01`, to: knownThrough };
  }
  return {
    from: `${normalizedPeriod}-01`,
    to: kstMonthEnd(normalizedPeriod),
  };
}

export interface SellpiaChannelSales {
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  sync: () => Promise<void>;
  syncing: boolean;
}

export function useSellpiaKnownThrough(): string | null {
  const { data } = useQuery({
    queryKey: [...queryKeys.dashboard.sellpiaSalesAll(), 'known-through'],
    queryFn: () => fetchSellpiaSalesSummary(),
    staleTime: 60_000,
  });
  return data?.knownThrough ?? null;
}

// Sellpia 판매현황(몰별 매출) 조회 + 명시적 수동 수집.
// 홈 월 매출 카드와 매출분석의 몰별 상세가 이 훅 하나를 공유한다(쿼리 dedupe).
// 조회는 선택 기간(from~to)별로 하고, 수집(스크랩)은 넓은 윈도우로 일별 이력을 누적한다.
export function useSellpiaChannelSales(range: {
  from: string;
  to: string;
} | null): SellpiaChannelSales {
  const from = range?.from;
  const to = range?.to;
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard.sellpiaSales(from ?? 'pending', to ?? 'pending'),
    queryFn: () => fetchSellpiaSalesSummary({ from: from!, to: to! }),
    enabled: !!from && !!to,
    refetchInterval: 60_000,
  });

  // 수집 후 모든 기간(from~to) 조회와 홈 준비 상태를 함께 갱신한다.
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.sellpiaSalesAll() }),
      queryClient.invalidateQueries({ queryKey: ['readiness'] }),
    ]);
  }, [queryClient]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await collectSellpiaSaleSummaryFromExtension();
      if (!result.success) {
        throw new Error(result.errorMessage ?? '셀피아 판매현황 수집에 실패했습니다.');
      }
      await invalidate();
      toast.success(`판매현황 수집 완료 (${result.sellerCount}개 몰, ${result.businessDates.length}일)`);
    } catch (err) {
      toast.error(sellpiaSalesErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }, [invalidate]);

  return { summary: data, isLoading, isError, refetch, sync, syncing };
}
