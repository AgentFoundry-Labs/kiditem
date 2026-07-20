'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/query-keys';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import {
  fetchSellpiaSalesSummary,
  ingestSellpiaSales,
  sellpiaSalesErrorMessage,
} from '@/lib/sellpia-sales-api';
import {
  collectSellpiaSaleSummaryFromExtension,
  readSellpiaSalesCacheFromExtension,
  clearSellpiaSalesCacheFromExtension,
} from '@/lib/sellpia-sales-collection';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';

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
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const autoSyncKey = organizationId
    ? `${AUTO_SYNC_KEY}:${organizationId}`
    : null;
  const [syncing, setSyncing] = useState(false);
  const autoRanForKey = useRef<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard.sellpiaSales(from, to),
    queryFn: () => fetchSellpiaSalesSummary({ from, to }),
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
      if (!organizationId) {
        throw new Error('판매현황을 저장할 조직 정보가 없습니다. 다시 로그인해주세요.');
      }
      const payload = await collectSellpiaSaleSummaryFromExtension({ organizationId });
      const result = await ingestSellpiaSales(payload);
      if (autoSyncKey) safeStorageSet('local', autoSyncKey, todayKst());
      await invalidate();
      toast.success(`판매현황 수집 완료 (${result.sellerCount}개 몰, ${result.businessDates.length}일)`);
    } catch (err) {
      toast.error(sellpiaSalesErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }, [autoSyncKey, invalidate, organizationId]);

  // 조직별 ref 가드로 단일 실행을 보장한다. 조직 전환 시에는 새 키로 다시 실행한다.
  // fire-and-forget이라 cleanup으로 취소하지 않는다(취소하면 dev 이중 호출에서 매번 no-op).
  useEffect(() => {
    if (!autoSyncKey || !organizationId) return;
    if (autoRanForKey.current === autoSyncKey) return;
    autoRanForKey.current = autoSyncKey;
    (async () => {
      let cached: Awaited<ReturnType<typeof readSellpiaSalesCacheFromExtension>> = null;
      try {
        cached = await readSellpiaSalesCacheFromExtension(organizationId);
      } catch { /* 확장 미설치/미로그인 — live 경로를 시도 */ }

      if (cached?.payload) {
        try {
          await ingestSellpiaSales(cached.payload);
          await invalidate();
          // 저장 성공 뒤 캐시 정리 실패는 같은 payload를 즉시 다시 저장할 이유가 아니다.
          try {
            await clearSellpiaSalesCacheFromExtension(organizationId);
          } catch { /* 다음 확장 실행에서 다시 정리 */ }
          const today = todayKst();
          if (
            cached.payload.range.from <= today &&
            cached.payload.range.to >= today
          ) {
            safeStorageSet('local', autoSyncKey, today);
            return;
          }
          // 어제 이전 캐시는 먼저 DB에 보존하되, 오늘 범위는 아래 live 수집으로 채운다.
        } catch { /* 원자 ingest 실패 — live 경로를 시도 */ }
      }

      if (safeStorageGet('local', autoSyncKey) === todayKst()) return;
      try {
        const payload = await collectSellpiaSaleSummaryFromExtension({ organizationId });
        await ingestSellpiaSales(payload);
        safeStorageSet('local', autoSyncKey, todayKst());
        await invalidate();
      } catch { /* 확장 미설치/셀피아 미로그인 — 조용히 스킵(수동 버튼으로 유도) */ }
    })();
  }, [autoSyncKey, invalidate, organizationId]);

  return { summary: data, isLoading, isError, refetch, sync, syncing };
}
