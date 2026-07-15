'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Eye,
  Flame,
  Loader2,
  PlaySquare,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  fetch1688HotProducts,
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
  fetchShortsTrends,
  type NaverKeywordSparklinePoint,
  type NaverKeywordTrendView,
  type PopularKeywordBoardView,
} from '../lib/trend-collection-api';
import { LiveCommerceSection } from './LiveCommerceSection';

const POPULAR_DAYS = 7;
const NAVER_KEYWORD_DAYS = 30;
const HOT_1688_DAYS = 7;
const SHORTS_DAYS = 7;

const EMPTY_HINT = '아직 수집 안 됨 — 지금 트렌드 수집 눌러주세요';

export function TrendCollectionViews() {
  return (
    <div className="space-y-5">
      <LiveCommerceSection />
      <PopularKeywordBoardsView />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NaverKeywordTableView />
        <ShortsListView />
      </div>
      <Hot1688GridView />
    </div>
  );
}

function PopularKeywordBoardsView() {
  const query = useQuery({
    queryKey: queryKeys.sourcing.trendPopularKeywords(POPULAR_DAYS),
    queryFn: () => fetchPopularKeywordBoards(POPULAR_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ViewCard
      icon={TrendingUp}
      title="네이버 인기키워드 보드"
      subtitle="문구·완구·유아 카테고리 인기검색어의 급상승과 신규 진입"
      state={query}
      isEmpty={(query.data?.boards.length ?? 0) === 0}
    >
      <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.boards.map((board) => (
          <PopularBoardCard key={board.boardKey} board={board} />
        ))}
      </div>
    </ViewCard>
  );
}

function PopularBoardCard({ board }: { board: PopularKeywordBoardView }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <p className="text-sm font-bold text-[var(--text-primary)]">{board.boardLabel ?? board.boardKey}</p>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-purple-700">급상승 · 신규 진입</p>
        {board.risers.length === 0 ? (
          <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">범위 내 상승 신호 없음</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {board.risers.slice(0, 6).map((riser) => (
              <li key={riser.keyword} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-[var(--text-primary)]">{riser.keyword}</span>
                {riser.rankDelta === null ? (
                  <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                    신규
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold tabular-nums text-emerald-600">
                    <ArrowUpRight size={11} />
                    {riser.rankDelta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--text-tertiary)]">최신 TOP</p>
        <ol className="mt-1.5 space-y-1">
          {board.latest.slice(0, 5).map((item) => (
            <li key={`${item.rank}-${item.keyword}`} className="flex items-center gap-2 text-xs">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white text-[10px] font-bold tabular-nums text-[var(--text-secondary)]">
                {item.rank}
              </span>
              <span className="truncate text-[var(--text-primary)]">{item.keyword}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function NaverKeywordTableView() {
  const query = useQuery({
    queryKey: queryKeys.sourcing.trendNaverKeywords(NAVER_KEYWORD_DAYS),
    queryFn: () => fetchNaverKeywordTrends(NAVER_KEYWORD_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ViewCard
      icon={Sparkles}
      title="네이버 월검색량 상위 키워드"
      subtitle={`시드별 월간 검색량과 최근 ${NAVER_KEYWORD_DAYS}일 검색지수 추이`}
      state={query}
      isEmpty={(query.data?.keywords.length ?? 0) === 0}
    >
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5 text-left font-semibold">키워드</th>
              <th className="px-3 py-2.5 text-right font-semibold">월 검색량</th>
              <th className="px-3 py-2.5 text-center font-semibold">경쟁</th>
              <th className="px-3 py-2.5 text-right font-semibold">검색지수</th>
              <th className="px-5 py-2.5 text-left font-semibold">추이</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.keywords.map((keyword) => (
              <NaverKeywordRow key={keyword.keyword} keyword={keyword} />
            ))}
          </tbody>
        </table>
      </div>
    </ViewCard>
  );
}

function NaverKeywordRow({ keyword }: { keyword: NaverKeywordTrendView }) {
  const { latest } = keyword;
  return (
    <tr className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]">
      <td className="px-5 py-2.5 font-semibold text-[var(--text-primary)]">{keyword.keyword}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text-primary)]">
        {latest.monthlyTotalSearchCount === null ? (
          <span className="font-medium text-[var(--text-tertiary)]">—</span>
        ) : (
          formatNumber(latest.monthlyTotalSearchCount)
        )}
      </td>
      <td className="px-3 py-2.5 text-center text-xs text-[var(--text-secondary)]">
        {latest.competitionIndex ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="inline-flex items-center justify-end gap-1 tabular-nums">
          <span className="font-bold text-[var(--text-primary)]">
            {latest.trendRatio ?? '—'}
          </span>
          {latest.trendDelta !== null && latest.trendDelta !== 0 && (
            <span
              className={cn(
                'text-[10px] font-bold',
                latest.trendDelta > 0 ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              {latest.trendDelta > 0 ? '+' : ''}
              {latest.trendDelta}
            </span>
          )}
        </span>
      </td>
      <td className="px-5 py-2.5">
        <TrendSparkline points={keyword.sparkline} />
      </td>
    </tr>
  );
}

function TrendSparkline({ points }: { points: NaverKeywordSparklinePoint[] }) {
  const width = 88;
  const height = 24;
  const total = Math.max(points.length - 1, 1);
  const coords = points
    .map((point, index) => {
      if (point.trendRatio === null) return null;
      const ratio = Math.max(0, Math.min(100, point.trendRatio));
      const x = (index / total) * width + 2;
      const y = height - (ratio / 100) * height + 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((value): value is string => value !== null);

  if (coords.length < 2) {
    return <span className="text-xs text-[var(--text-quaternary)]">데이터 부족</span>;
  }

  return (
    <svg viewBox="0 0 92 32" className="h-8 w-[92px]" role="img" aria-label="검색지수 추이">
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
    </svg>
  );
}

function Hot1688GridView() {
  const query = useQuery({
    queryKey: queryKeys.sourcing.trend1688Hot(HOT_1688_DAYS),
    queryFn: () => fetch1688HotProducts(HOT_1688_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ViewCard
      icon={Flame}
      title="1688 검색 반응 상위"
      subtitle="중국어 기본 시드·사용자 시드의 검색 결과를 거래 표시값순으로 정렬 · 공식 랭킹 아님"
      state={query}
      isEmpty={(query.data?.offers.length ?? 0) === 0}
      emptyHint="1688 데이터가 없습니다. 최근 수집 결과에서 로그인·슬라이더 검증 오류를 확인해주세요."
      badge={query.data?.capturedAt
        ? `저장 ${formatDateTime(query.data.capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : undefined}
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {query.data?.offers.map((offer) => (
          <article
            key={offer.offerId}
            className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="relative aspect-square bg-[var(--surface-sunken)]">
              {offer.imageUrl ? (
                <img
                  src={offer.imageUrl}
                  alt={offer.title ?? offer.offerId}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-quaternary)]">
                  <Flame size={22} />
                </div>
              )}
              {offer.newlyRanked && (
                <span className="absolute left-2 top-2 rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  신규
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <p className="line-clamp-2 text-xs font-medium leading-4 text-[var(--text-primary)]">
                {offer.title ?? offer.offerId}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-sm font-bold tabular-nums text-orange-600">
                  {offer.priceCny === null ? '—' : `¥${formatNumber(offer.priceCny)}`}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  거래 {offer.monthlySales === null ? '—' : formatNumber(offer.monthlySales)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-tertiary)]">
                {offer.repurchaseRate && <span>재구매 {offer.repurchaseRate}</span>}
                {offer.supplierName && <span className="truncate">· {offer.supplierName}</span>}
              </div>
              {offer.sourceUrl && (
                <a
                  href={offer.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900"
                >
                  1688 상세
                  <ArrowUpRight size={12} />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </ViewCard>
  );
}

function ShortsListView() {
  const query = useQuery({
    queryKey: queryKeys.sourcing.trendShorts(SHORTS_DAYS),
    queryFn: () => fetchShortsTrends(SHORTS_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ViewCard
      icon={PlaySquare}
      title="문구·완구 쇼츠 급상승"
      subtitle="YouTube Shorts 최근 48시간 · 문구·완구 시드와 일치하는 영상만 표시"
      state={query}
      isEmpty={(query.data?.items.length ?? 0) === 0}
      emptyHint="최근 48시간 수집분에서 문구·완구에 일치하는 쇼츠가 없습니다."
      badge={query.data?.capturedAt
        ? `저장 ${formatDateTime(query.data.capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : undefined}
    >
      <ul className="divide-y divide-[var(--border-subtle)]">
        {query.data?.items.slice(0, 20).map((item, index) => (
          <li key={item.videoKey} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
              {item.rank ?? index + 1}
            </span>
            <div className="relative h-11 w-[74px] shrink-0 overflow-hidden rounded-md bg-[var(--surface-sunken)]">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title ?? item.videoKey}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-quaternary)]">
                  <PlaySquare size={16} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {item.videoUrl ? (
                  <a
                    href={item.videoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-purple-700"
                  >
                    {item.title ?? item.videoKey}
                  </a>
                ) : (
                  item.title ?? item.videoKey
                )}
              </p>
              <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                {item.channelName ?? '채널 미상'}
                {item.keyword ? ` · ${item.keyword}` : ''}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
              <Eye size={12} />
              {item.viewCount === null ? '—' : formatNumber(item.viewCount)}
            </span>
          </li>
        ))}
      </ul>
    </ViewCard>
  );
}

interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

function ViewCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  emptyHint,
  state,
  isEmpty,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  badge?: string;
  emptyHint?: string;
  state: QueryLike;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Icon size={16} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
            {badge}
          </span>
        )}
      </div>

      {state.isLoading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin text-purple-600" />
          불러오는 중…
        </div>
      ) : state.isError ? (
        <div className="px-5 py-12 text-center">
          <AlertCircle size={28} className="mx-auto text-rose-400" />
          <p className="mt-2 text-sm font-semibold text-rose-700">데이터를 가져오지 못했습니다.</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {state.error instanceof Error ? state.error.message : '잠시 후 다시 시도해주세요.'}
          </p>
          <button
            type="button"
            onClick={() => state.refetch()}
            className="mt-3 text-sm font-semibold text-[var(--primary)] hover:text-purple-700"
          >
            다시 시도
          </button>
        </div>
      ) : isEmpty ? (
        <div className="px-5 py-12 text-center">
          <Icon size={28} className="mx-auto text-[var(--text-quaternary)]" />
          <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
            {emptyHint ?? EMPTY_HINT}
          </p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
