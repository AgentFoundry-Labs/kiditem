'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import { queryKeys } from '@/lib/query-keys';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { fetchSellpiaSalesSummary, ingestSellpiaSales } from '@/lib/sellpia-sales-api';
import {
  collectSellpiaSaleSummaryFromExtension,
  readSellpiaSalesCacheFromExtension,
  clearSellpiaSalesCacheFromExtension,
} from '@/lib/sellpia-sales-collection';

const AUTO_SYNC_KEY = 'kiditem-sellpia-sales-autosync';

function ymdKst(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
}

function todayKst(): string {
  return ymdKst(new Date());
}

// 대시보드 기간 선택(일/주/월/기간) → Sellpia 조회 from/to(KST) 계산.
// 일: 오늘 / 주: 최근 7일 / 월: 이번 달 1일~오늘 / 기간: 사용자 지정.
export function sellpiaPeriodRange(
  range: 'day' | 'week' | 'month' | 'custom',
  dateFrom: string,
  dateTo: string,
): { from: string; to: string } {
  if (range === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
  const today = todayKst();
  if (range === 'day') return { from: today, to: today };
  if (range === 'week') {
    const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    return { from: ymdKst(start), to: today };
  }
  // month: 이번 달 1일 ~ 오늘 (KST)
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export interface SellpiaChannelSales {
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  sync: () => Promise<void>;
  syncing: boolean;
}

// Sellpia 판매현황(몰별 매출) 조회 + 마운트 자동 동기화 + 수동 수집.
// 대시보드 월 매출/순이익 카드와 몰별 상세가 이 훅 하나를 공유한다(쿼리 dedupe).
// 조회는 선택 기간(from~to)별로 하고, 수집(스크랩)은 넓은 윈도우로 일별 이력을 누적한다.
export function useSellpiaChannelSales({
  from,
  to,
}: {
  from: string;
  to: string;
}): SellpiaChannelSales {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const autoRan = useRef(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard.sellpiaSales(from, to),
    queryFn: () => fetchSellpiaSalesSummary({ from, to }),
    refetchInterval: 60_000,
  });

  // 수집 후 모든 기간(from~to) 조회를 무효화한다(prefix 매칭).
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.sellpiaSalesAll() });
  }, [queryClient]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const payload = await collectSellpiaSaleSummaryFromExtension();
      const result = await ingestSellpiaSales(payload);
      safeStorageSet('local', AUTO_SYNC_KEY, todayKst());
      invalidate();
      toast.success(`판매현황 수집 완료 (${result.sellerCount}개 몰, ${result.businessDates.length}일)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '판매현황 수집에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  }, [invalidate]);

  // autoRan ref 가드만으로 단일 실행 보장(StrictMode 재마운트에도 ref 유지). fire-and-forget
  // 이라 cleanup 으로 취소하지 않는다(취소하면 dev 이중 호출에서 매번 no-op). state setter 미호출.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    (async () => {
      try {
        const cached = await readSellpiaSalesCacheFromExtension();
        if (cached?.payload?.sellers?.length) {
          await ingestSellpiaSales(cached.payload);
          await clearSellpiaSalesCacheFromExtension();
          invalidate();
        }
      } catch { /* 확장 미설치/미로그인 — 무시 */ }

      if (safeStorageGet('local', AUTO_SYNC_KEY) === todayKst()) return;
      try {
        const payload = await collectSellpiaSaleSummaryFromExtension();
        await ingestSellpiaSales(payload);
        safeStorageSet('local', AUTO_SYNC_KEY, todayKst());
        invalidate();
      } catch { /* 확장 미설치/셀피아 미로그인 — 조용히 스킵(수동 버튼으로 유도) */ }
    })();
  }, [invalidate]);

  return { summary: data, isLoading, isError, refetch, sync, syncing };
}
