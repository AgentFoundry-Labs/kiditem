'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Compass,
  Flame,
  type LucideIcon,
  Radar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  fetchKeywordTrackers,
  fetchLatestRisingProducts,
  type RisingProductCandidate,
} from '../rising-products/lib/rising-products-api';
import { buildTrendKeywords, type TrendKeyword } from '../rising-products/lib/rising-keywords';
import {
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
} from '../market/lib/trend-collection-api';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

type SnapshotPayload = { result?: { rows?: TodayRecommendationRow[] } };

interface StatCard {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
}

/**
 * 소싱 홈 상단 히어로 + 실데이터 KPI + 급상승/트렌드 리스트업.
 * (구 RealtimeSourcingTerminal 하드코딩 목업을 대체. 하단의 추천 레일·랭킹·시장분석은 유지.)
 */
export function SourcingHomeHero() {
  const localRecs = useTodayRecommendationRows();

  const { data: risingData } = useQuery({
    queryKey: ['sourcing', 'home', 'rising'],
    queryFn: fetchLatestRisingProducts,
  });
  const { data: trackers = [] } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'keyword-trackers'],
    queryFn: fetchKeywordTrackers,
  });
  const { data: naverData } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'naver-keywords'],
    queryFn: () => fetchNaverKeywordTrends(7),
  });
  const { data: boardsData } = useQuery({
    queryKey: ['sourcing', 'rising-products', 'popular-keywords'],
    queryFn: () => fetchPopularKeywordBoards(7),
  });
  const { data: recSnapshot = [] } = useQuery({
    queryKey: ['sourcing', 'home', 'today-rec-snapshot'],
    queryFn: async () => {
      const { snapshot } =
        await getTodaySourcingWorkspaceSnapshot<SnapshotPayload>('today_recommendations');
      return snapshot?.payload?.result?.rows ?? [];
    },
  });

  const rising = useMemo(
    () => (risingData?.model?.candidates ?? []).filter((c) => c.grade !== 'EXCLUDE'),
    [risingData],
  );
  const trend = useMemo(
    () =>
      buildTrendKeywords({
        naverKeywords: naverData?.keywords ?? [],
        boards: boardsData?.boards ?? [],
        tracked: trackers.map((t) => t.keyword),
      }),
    [naverData, boardsData, trackers],
  );
  const recCount = useMemo(() => {
    const source = localRecs.length > 0 ? localRecs : recSnapshot;
    return new Set(source.map((row) => row.productId || row.vendorItemId || row.productName)).size;
  }, [localRecs, recSnapshot]);

  const stats: StatCard[] = [
    { label: '오늘의 추천', value: recCount, href: '/sourcing-ai/recommendations', icon: Sparkles },
    { label: '급상승 후보', value: rising.length, href: '/sourcing-ai/rising-products', icon: Flame },
    { label: '추적 키워드', value: trackers.length, href: '/sourcing-ai/rising-products', icon: Radar },
    { label: '트렌드 키워드', value: trend.length, href: '/sourcing-ai/keywords', icon: TrendingUp },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--primary)]">
            <Compass size={12} />
            소싱 에이전트
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
            뜨는 상품을 먼저 찾아 소싱하세요
          </h1>
          <p className="mt-1.5 text-sm font-bold leading-relaxed text-[var(--text-tertiary)]">
            트렌드 수집 → 쿠팡 급상승 탐지 → 1688 소싱 → 검증까지, 한 흐름으로.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/sourcing-ai/rising-products"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]"
          >
            <Flame size={16} />
            급상승 탐지
          </Link>
          <Link
            href="/sourcing-ai/recommendations"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Sparkles size={16} />
            오늘의 추천
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatTile key={stat.label} stat={stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <RisingList rising={rising} />
        <TrendKeywordList trend={trend} />
      </div>
    </section>
  );
}

function StatTile({ stat }: { stat: StatCard }) {
  const Icon = stat.icon;
  return (
    <Link
      href={stat.href}
      className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--primary)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">{stat.label}</span>
        <Icon size={15} className="text-[var(--text-tertiary)] transition group-hover:text-[var(--primary)]" />
      </div>
      <p className="mt-1 text-3xl font-black tracking-tight tabular-nums text-[var(--text-primary)]">
        {formatNumber(stat.value)}
      </p>
    </Link>
  );
}

function ListCard({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-sm font-black text-[var(--text-primary)]">{title}</h2>
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-xs font-black text-[var(--primary)] hover:underline"
        >
          전체
          <ArrowRight size={12} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function RisingList({ rising }: { rising: RisingProductCandidate[] }) {
  const top = rising.slice(0, 6);
  return (
    <ListCard title="급상승 후보" href="/sourcing-ai/rising-products">
      {top.length === 0 ? (
        <EmptyHint text="감지 실행 시 뜨는 상품이 표시됩니다" />
      ) : (
        <ul>
          {top.map((c, index) => (
            <li
              key={c.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2',
                index < top.length - 1 && 'border-b border-[var(--border-subtle)]',
              )}
            >
              <span className="w-4 shrink-0 text-center text-xs font-black text-[var(--text-tertiary)]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[var(--text-primary)]">{c.productName}</p>
                <p className="truncate text-[11px] font-bold text-[var(--text-tertiary)]">
                  #{c.keyword}
                  {c.signals.rankClimb != null && c.signals.rankClimb > 0
                    ? ` · 순위 ↑${formatNumber(c.signals.rankClimb)}`
                    : ''}
                </p>
              </div>
              <span className="shrink-0 text-base font-black tabular-nums text-[var(--primary)]">{c.score}</span>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

function TrendKeywordList({ trend }: { trend: TrendKeyword[] }) {
  const top = trend.slice(0, 10);
  return (
    <ListCard title="트렌드 키워드" href="/sourcing-ai/keywords">
      {top.length === 0 ? (
        <EmptyHint text="키워드 분석에서 키워드를 조회하면 표시됩니다" />
      ) : (
        <ul>
          {top.map((k, index) => (
            <li
              key={k.keyword}
              className={cn(
                'flex items-center gap-3 px-4 py-2',
                index < top.length - 1 && 'border-b border-[var(--border-subtle)]',
              )}
            >
              <span className="w-4 shrink-0 text-center text-xs font-black text-[var(--text-tertiary)]">
                {index + 1}
              </span>
              <a
                href={`https://www.coupang.com/np/search?q=${encodeURIComponent(k.keyword)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-black text-[var(--text-primary)] hover:text-[var(--primary)]"
                title={k.keyword}
              >
                {k.keyword}
              </a>
              <TrendSignal keyword={k} />
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

function TrendSignal({ keyword }: { keyword: TrendKeyword }) {
  if (keyword.kind === 'search' && keyword.monthlySearchVolume != null) {
    return (
      <span className="shrink-0 text-[11px] font-black tabular-nums text-[var(--text-tertiary)]">
        월 {formatNumber(keyword.monthlySearchVolume)}
      </span>
    );
  }
  if (keyword.isNew) {
    return <span className="shrink-0 text-[11px] font-black text-rose-500">NEW</span>;
  }
  if (keyword.rankDelta != null && keyword.rankDelta > 0) {
    return (
      <span className="shrink-0 text-[11px] font-black text-emerald-600">
        ↑{formatNumber(keyword.rankDelta)}
      </span>
    );
  }
  if (keyword.bestRank != null) {
    return (
      <span className="shrink-0 text-[11px] font-black text-[var(--text-tertiary)]">
        {formatNumber(keyword.bestRank)}위
      </span>
    );
  }
  return null;
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-xs font-bold text-[var(--text-tertiary)]">{text}</p>;
}
