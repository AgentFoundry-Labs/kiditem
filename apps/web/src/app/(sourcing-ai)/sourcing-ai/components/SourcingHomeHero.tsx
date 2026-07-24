'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  Database,
  Flame,
  Radar,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, formatTime } from '@/lib/utils';
import { friendlyError } from '@/lib/api-error';
import {
  fetchKeywordTrackers,
  fetchLatestRisingProducts,
} from '../rising-products/lib/rising-products-api';
import {
  collectTrend,
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
  fetchShortsTrends,
} from '../market/lib/trend-collection-api';
import { normalizeKeyword } from '../rising-products/lib/rising-keywords';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import { SourcingHomeRecommendationRail } from './SourcingHomeRecommendationRail';
import { SourcingHomeRankBoard, type RankColumn } from './SourcingHomeRankBoard';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

type SnapshotPayload = { result?: { rows?: TodayRecommendationRow[] } };

// 실시간 폴링 간격 — 메인 대시보드와 동일하게 60초.
const REFETCH_MS = 60_000;
const LIST_LIMIT = 10;

/**
 * 소싱 홈 상단 — 실시간 헤더 + KPI 5열 랭킹 보드 + 오늘의 추천 레일.
 * 5열: 급상승 후보 / 신규 키워드 / SNS 소셜 인기 / 추적 키워드 / 인기 키워드.
 */
export function SourcingHomeHero() {
  const queryClient = useQueryClient();
  const localRecs = useTodayRecommendationRows();

  const risingQuery = useQuery({
    queryKey: ['sourcing', 'home', 'rising'],
    queryFn: fetchLatestRisingProducts,
    refetchInterval: REFETCH_MS,
  });
  const { data: trackers = [] } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'keyword-trackers'],
    queryFn: fetchKeywordTrackers,
    refetchInterval: REFETCH_MS,
  });
  const { data: boardsData } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'popular-keywords'],
    queryFn: () => fetchPopularKeywordBoards(7),
    refetchInterval: REFETCH_MS,
  });
  // 신규 키워드에 네이버 검색광고 월검색량을 조인하기 위한 소스(30일).
  const { data: naverData } = useQuery({
    queryKey: ['sourcing', 'home', 'naver-keywords', 30],
    queryFn: () => fetchNaverKeywordTrends(30),
    refetchInterval: REFETCH_MS,
  });
  const { data: shortsData } = useQuery({
    // SNS 소셜 인기 키워드는 표본이 얇아 30일 범위로 넓게 수집한다.
    queryKey: ['sourcing', 'home', 'shorts', 30],
    queryFn: () => fetchShortsTrends(30),
    refetchInterval: REFETCH_MS,
  });
  const { data: recSnapshot = [] } = useQuery({
    queryKey: ['sourcing', 'home', 'today-rec-snapshot'],
    queryFn: async () => {
      const { snapshot } =
        await getTodaySourcingWorkspaceSnapshot<SnapshotPayload>('today_recommendations');
      return snapshot?.payload?.result?.rows ?? [];
    },
    refetchInterval: REFETCH_MS,
  });

  const rising = useMemo(
    () => (risingQuery.data?.model?.candidates ?? []).filter((c) => c.grade !== 'EXCLUDE'),
    [risingQuery.data],
  );

  // 신규 키워드 — DataLab 인기보드 신규 진입(rankDelta === null)에 네이버 검색광고
  // 월검색량을 조인해 검색량 큰 순으로 정렬한다. (볼륨 없는 키워드는 순위순으로 뒤에.)
  const newKeywords = useMemo(() => {
    const naverVolume = new Map<string, number>();
    for (const kw of naverData?.keywords ?? []) {
      const volume = kw.latest.monthlyTotalSearchCount;
      if (volume != null) naverVolume.set(normalizeKeyword(kw.keyword), volume);
    }
    const seen = new Set<string>();
    const out: Array<{ keyword: string; board: string; rank: number; volume: number | null }> = [];
    for (const board of boardsData?.boards ?? []) {
      const rankByKeyword = new Map((board.latest ?? []).map((e) => [e.keyword, e.rank]));
      for (const riser of board.risers ?? []) {
        if (riser.rankDelta !== null) continue;
        const norm = normalizeKeyword(riser.keyword);
        if (seen.has(norm)) continue;
        seen.add(norm);
        out.push({
          keyword: riser.keyword,
          board: board.boardLabel ?? '신규 진입',
          rank: rankByKeyword.get(riser.keyword) ?? 999,
          volume: naverVolume.get(norm) ?? null,
        });
      }
    }
    return out.sort((a, b) => {
      const va = a.volume ?? -1;
      const vb = b.volume ?? -1;
      return vb !== va ? vb - va : a.rank - b.rank;
    });
  }, [boardsData, naverData]);

  // SNS 소셜 인기 — 유튜브 쇼츠를 키워드 단위로 집계(조회수 합산)해 #키워드로 리스트업.
  // (인스타그램은 아직 수집 소스가 없어 유튜브만.)
  const snsKeywords = useMemo(() => {
    const map = new Map<string, { keyword: string; views: number; count: number }>();
    for (const item of shortsData?.items ?? []) {
      const kw = item.keyword;
      if (!kw) continue;
      const cur = map.get(kw) ?? { keyword: kw, views: 0, count: 0 };
      cur.views += item.viewCount ?? 0;
      cur.count += 1;
      map.set(kw, cur);
    }
    return [...map.values()].sort((a, b) => b.views - a.views);
  }, [shortsData]);

  // 인기 키워드 — 키워드 분석 수집분(인기보드) 중 카테고리별 대표를 라운드로빈으로.
  const popular = useMemo(() => {
    const boards = boardsData?.boards ?? [];
    const seen = new Set<string>();
    const out: Array<{ keyword: string; board: string }> = [];
    for (let depth = 0; depth < 6 && out.length < LIST_LIMIT; depth += 1) {
      for (const board of boards) {
        const entry = board.latest?.[depth];
        if (!entry || seen.has(entry.keyword)) continue;
        seen.add(entry.keyword);
        out.push({ keyword: entry.keyword, board: board.boardLabel ?? '인기' });
        if (out.length >= LIST_LIMIT) break;
      }
    }
    return out;
  }, [boardsData]);

  const popularTotal = useMemo(() => {
    const seen = new Set<string>();
    for (const board of boardsData?.boards ?? []) {
      for (const entry of board.latest ?? []) seen.add(entry.keyword);
    }
    return seen.size;
  }, [boardsData]);

  const lastUpdated = risingQuery.dataUpdatedAt || undefined;

  const collectMutation = useMutation({
    mutationFn: () => collectTrend(),
    onSuccess: (result) => {
      const total = result.results.reduce((sum, r) => sum + (r.collected ?? 0), 0);
      toast.success(`데이터 수집 완료 · ${formatNumber(total)}건 갱신`);
    },
    onError: (error) => toast.error(friendlyError(error) ?? '데이터 수집에 실패했습니다.'),
    // 성공/실패와 무관하게 전체 소싱 데이터를 다시 불러온다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sourcing'] });
    },
  });

  const columns: RankColumn[] = [
    {
      label: '급상승 후보',
      count: rising.length,
      accent: '#ea580c',
      icon: Flame,
      href: '/sourcing-ai/rising-products',
      emptyText: '감지 실행 시 뜨는 상품이 표시됩니다',
      items: rising.slice(0, LIST_LIMIT).map((c) => ({
        key: c.id,
        title: c.productName,
        meta: `#${c.keyword}`,
        value: `${formatNumber(c.score)}점`,
      })),
    },
    {
      label: '신규 키워드',
      count: newKeywords.length,
      accent: '#7c3aed',
      icon: Sparkles,
      href: '/sourcing-ai/keywords',
      emptyText: '인기보드 신규 진입 키워드가 표시됩니다',
      items: newKeywords.slice(0, LIST_LIMIT).map((k, index) => ({
        key: `${k.keyword}-${index}`,
        title: k.keyword,
        meta: k.board,
        value: k.volume != null ? `월 ${formatNumber(k.volume)}` : 'NEW',
      })),
    },
    {
      label: 'SNS 소셜 인기',
      count: snsKeywords.length,
      accent: '#db2777',
      icon: Share2,
      href: '/sourcing-ai/market',
      emptyText: '쇼츠 트렌드 수집 후 표시됩니다',
      items: snsKeywords.slice(0, LIST_LIMIT).map((k) => ({
        key: k.keyword,
        title: `#${k.keyword}`,
        meta: `${formatNumber(k.count)}개 영상`,
        value: compactViews(k.views),
      })),
    },
    {
      label: '추적 키워드',
      count: trackers.length,
      accent: '#0284c7',
      icon: Radar,
      href: '/sourcing-ai/rising-products',
      emptyText: '추적 키워드를 등록하면 표시됩니다',
      items: trackers.slice(0, LIST_LIMIT).map((t) => ({
        key: t.keyword,
        title: t.keyword,
        meta: 'SERP 추적',
      })),
    },
    {
      label: '인기 키워드',
      count: popularTotal,
      accent: '#059669',
      icon: Star,
      href: '/sourcing-ai/keywords',
      emptyText: '키워드 분석에서 수집하면 표시됩니다',
      items: popular.map((p, index) => ({
        key: `${p.keyword}-${index}`,
        title: p.keyword,
        meta: p.board,
      })),
    },
  ];

  return (
    <section className="space-y-3">
      {/* 헤더 — 제목 우측에 실시간 상태, 오른쪽 끝에 데이터 수집 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700">
            <Compass size={18} className="text-white" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">소싱 에이전트</h1>
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px] font-semibold text-emerald-600">실시간</span>
            {lastUpdated && (
              <span className="font-mono text-[11px] text-slate-400">· {formatTime(lastUpdated)} 갱신</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => collectMutation.mutate()}
          disabled={collectMutation.isPending}
          title="네이버·1688·쇼츠 트렌드를 수집하고 전체 소싱 데이터를 갱신합니다"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Database size={14} className={collectMutation.isPending ? 'animate-pulse' : undefined} />
          {collectMutation.isPending ? '수집 중…' : '데이터 수집'}
        </button>
      </div>

      {/* KPI 5열 랭킹 보드 */}
      <SourcingHomeRankBoard columns={columns} />

      {/* 오늘의 추천 상품 — 보드 하단, 세로 스크롤 레일 */}
      <SourcingHomeRecommendationRail />
    </section>
  );
}

function compactViews(views: number | null): string | undefined {
  if (views == null || views <= 0) return undefined;
  if (views >= 10_000) return `${formatNumber(Math.round(views / 10_000))}만`;
  return formatNumber(views);
}
