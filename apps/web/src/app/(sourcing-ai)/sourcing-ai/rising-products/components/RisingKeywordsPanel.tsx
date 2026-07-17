'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpRight, Check, Loader2, Plus, Radar, Sparkle } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import {
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
} from '../../market/lib/trend-collection-api';
import {
  addKeywordTracker,
  fetchKeywordTrackers,
} from '../lib/rising-products-api';
import {
  buildTrendKeywords,
  type TrendKeyword,
} from '../lib/rising-keywords';

const NAVER_QUERY_KEY = ['sourcing', 'rising-products', 'naver-keywords'];
const POPULAR_QUERY_KEY = ['sourcing', 'rising-products', 'popular-keywords'];
const TRACKERS_QUERY_KEY = ['sourcing', 'rising-products', 'keyword-trackers'];

export function RisingKeywordsPanel() {
  const queryClient = useQueryClient();

  const { data: naverData, isLoading: naverLoading } = useQuery({
    queryKey: NAVER_QUERY_KEY,
    queryFn: () => fetchNaverKeywordTrends(7),
  });
  const { data: boardsData, isLoading: boardsLoading } = useQuery({
    queryKey: POPULAR_QUERY_KEY,
    queryFn: () => fetchPopularKeywordBoards(7),
  });
  const { data: trackers = [] } = useQuery({
    queryKey: TRACKERS_QUERY_KEY,
    queryFn: fetchKeywordTrackers,
  });

  const keywords = useMemo(
    () =>
      buildTrendKeywords({
        naverKeywords: naverData?.keywords ?? [],
        boards: boardsData?.boards ?? [],
        tracked: trackers.map((t) => t.keyword),
      }),
    [naverData, boardsData, trackers],
  );
  const loading = naverLoading || boardsLoading;
  const untracked = useMemo(() => keywords.filter((k) => !k.tracked), [keywords]);

  const trackMutation = useMutation({
    mutationFn: (keyword: string) => addKeywordTracker(keyword),
    onSuccess: (_data, keyword) => {
      void queryClient.invalidateQueries({ queryKey: TRACKERS_QUERY_KEY });
      toast.success(`"${keyword}" 추적 시작`, {
        description: 'SERP 수집 후 1~2일 뒤 급상승 후보에 반영됩니다',
      });
    },
    onError: (error) =>
      toast.error(isApiError(error) ? error.message : '키워드 추적 추가에 실패했습니다'),
  });

  const bulkMutation = useMutation({
    mutationFn: async (list: string[]) => {
      let added = 0;
      for (const keyword of list) {
        try {
          await addKeywordTracker(keyword);
          added += 1;
        } catch {
          // 개별 실패는 건너뛰고 계속 — 부분 성공 허용
        }
      }
      return added;
    },
    onSuccess: (added) => {
      void queryClient.invalidateQueries({ queryKey: TRACKERS_QUERY_KEY });
      toast.success(added > 0 ? `${added}개 키워드 추적 시작` : '추가할 키워드가 없습니다');
    },
  });

  const busyKeyword = trackMutation.isPending ? trackMutation.variables : null;

  return (
    <aside className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff5a1f]/10 text-[#ff5a1f]">
            <Radar size={16} />
          </span>
          <div>
            <h2 className="text-sm font-black leading-tight">실시간 트렌드 키워드</h2>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)]">
              네이버 검색광고 급상승·검색량순 · 없으면 인기보드
            </p>
          </div>
        </div>
        {untracked.length > 0 ? (
          <button
            type="button"
            onClick={() => bulkMutation.mutate(untracked.slice(0, 10).map((k) => k.keyword))}
            disabled={bulkMutation.isPending}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[#ff5a1f] hover:text-[#ff5a1f] disabled:opacity-50"
          >
            {bulkMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            상위 추적
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : keywords.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs font-bold leading-relaxed text-[var(--text-tertiary)]">
            트렌드 키워드가 아직 없습니다.
            <br />
            <span className="text-[var(--text-secondary)]">키워드 분석</span>에서 키워드를 조회하거나
            시장 분석 → 트렌드 수집을 먼저 실행하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {keywords.map((keyword) => (
              <KeywordRow
                key={keyword.keyword}
                keyword={keyword}
                busy={busyKeyword === keyword.keyword}
                onTrack={() => trackMutation.mutate(keyword.keyword)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function KeywordRow({
  keyword,
  busy,
  onTrack,
}: {
  keyword: TrendKeyword;
  busy: boolean;
  onTrack: () => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-[var(--surface-sunken)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <a
            href={`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword.keyword)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-black hover:text-[#ff5a1f]"
            title={keyword.keyword}
          >
            {keyword.keyword}
          </a>
          {keyword.kind === 'search' && keyword.trendDelta != null && keyword.trendDelta > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">
              <ArrowUpRight size={9} /> {formatNumber(keyword.trendDelta)}
            </span>
          ) : keyword.isNew ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-black text-rose-500">
              <Sparkle size={9} /> NEW
            </span>
          ) : keyword.rankDelta != null && keyword.rankDelta > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">
              <ArrowUpRight size={9} /> {formatNumber(keyword.rankDelta)}
            </span>
          ) : keyword.bestRank != null ? (
            <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-black text-[var(--text-tertiary)]">
              인기 {formatNumber(keyword.bestRank)}위
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-bold text-[var(--text-tertiary)]">
          {keyword.kind === 'search'
            ? keyword.monthlySearchVolume != null
              ? `월 ${formatNumber(keyword.monthlySearchVolume)} 검색`
              : '검색광고 키워드'
            : keyword.boards.join(' · ')}
        </p>
      </div>
      {keyword.tracked ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-black text-emerald-600">
          <Check size={12} /> 추적중
        </span>
      ) : (
        <button
          type="button"
          onClick={onTrack}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[11px] font-black text-[var(--text-secondary)] opacity-0 transition hover:bg-[#ff5a1f] hover:text-white group-hover:opacity-100 disabled:opacity-100"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          추적
        </button>
      )}
    </li>
  );
}
