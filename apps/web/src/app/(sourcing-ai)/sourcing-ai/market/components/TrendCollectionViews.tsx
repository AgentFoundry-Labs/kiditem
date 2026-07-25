'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Eye,
  Flame,
  Hash,
  Loader2,
  PlaySquare,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { TrendExtensionError } from '../lib/1688-trend-extension';
import { collectTiktokCcFromChrome } from '../lib/tiktok-cc-trend-extension';
import {
  fetch1688HotProducts,
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
  fetchShortsTrends,
  fetchTiktokCcTrends,
  type NaverKeywordSparklinePoint,
  type NaverKeywordTrendView,
  type PopularKeywordBoardView,
  type TiktokCcRegionView,
  type TiktokCcTrendType,
} from '../lib/trend-collection-api';
import { fetchLiveCommerceKeywords, type LiveTrendKeywordView } from '../lib/live-commerce-api';
import { isDouyinTrendSourceKeyword } from '../lib/douyin-trend';
import { LiveCommerceSection } from './LiveCommerceSection';

const POPULAR_DAYS = 7;
const NAVER_KEYWORD_DAYS = 30;
const HOT_1688_DAYS = 7;
const SHORTS_DAYS = 7;
const TIKTOK_CC_DAYS = 7;
const LIVE_KEYWORD_DAYS = 7;

const EMPTY_HINT = '아직 수집 안 됨 — 지금 트렌드 수집 눌러주세요';

const TIKTOK_TREND_TYPE_META: Record<TiktokCcTrendType, { label: string; className: string }> = {
  hashtag: { label: '해시태그', className: 'bg-slate-900 text-white' },
  keyword: { label: '키워드', className: 'bg-indigo-100 text-indigo-700' },
  product: { label: '상품', className: 'bg-emerald-100 text-emerald-700' },
  song: { label: '음원', className: 'bg-pink-100 text-pink-700' },
};

export function TrendCollectionViews() {
  return (
    <div className="space-y-5">
      <LiveCommerceSection />
      <LiveKeywordDigestView />
      <PopularKeywordBoardsView />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NaverKeywordTableView />
        <ShortsListView />
      </div>
      <TiktokCcTrendView />
      <Hot1688GridView />
    </div>
  );
}

/** 라이브 방송 상품명에서 역추출한 문구·완구 트렌드 키워드 (SNS 라이브 → 소싱 키워드). */
function LiveKeywordDigestView() {
  const query = useQuery({
    queryKey: queryKeys.sourcing.liveCommerceKeywords(LIVE_KEYWORD_DAYS),
    queryFn: () => fetchLiveCommerceKeywords(LIVE_KEYWORD_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ViewCard
      icon={Radio}
      title="라이브 연관 키워드"
      subtitle="1688·도우인 라이브 방송에 노출된 상품명에서 역추출한 문구·완구 키워드"
      state={query}
      isEmpty={(query.data?.keywords.length ?? 0) === 0}
      emptyHint="아직 라이브 방송 수집분이 없습니다. 라이브 방송 수집을 먼저 실행하세요."
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.keywords.map((keyword) => (
          <LiveKeywordCard key={keyword.keyword} keyword={keyword} />
        ))}
      </div>
    </ViewCard>
  );
}

function LiveKeywordCard({ keyword }: { keyword: LiveTrendKeywordView }) {
  const priceLabel =
    keyword.minPriceCny === null
      ? null
      : keyword.minPriceCny === keyword.maxPriceCny
        ? `¥${formatNumber(keyword.minPriceCny)}`
        : `¥${formatNumber(keyword.minPriceCny)}–${formatNumber(keyword.maxPriceCny ?? keyword.minPriceCny)}`;
  return (
    <article className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
        {keyword.topImageUrl ? (
          <img src={keyword.topImageUrl} alt={keyword.keyword} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-quaternary)]">
            <Radio size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold text-[var(--text-primary)]">{keyword.keyword}</p>
          <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-rose-700">
            상품 {formatNumber(keyword.productCount)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {keyword.sources.map((source) => (
            <span key={source} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]">
              {source}
            </span>
          ))}
          {priceLabel && <span className="text-[11px] font-semibold tabular-nums text-orange-600">{priceLabel}</span>}
          {keyword.totalSales !== null && (
            <span className="text-[10px] text-[var(--text-tertiary)]">판매 {formatNumber(keyword.totalSales)}</span>
          )}
        </div>
        {keyword.sampleTitles.length > 0 && (
          <p className="mt-1 line-clamp-1 text-[11px] text-[var(--text-tertiary)]" title={keyword.sampleTitles.join(' · ')}>
            {keyword.sampleTitles.join(' · ')}
          </p>
        )}
      </div>
    </article>
  );
}

/** 틱톡 크리에이티브 센터 인기 해시태그·키워드·상품 (확장 수집 + 트리거). */
function TiktokCcTrendView() {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey: queryKeys.sourcing.trendTiktokCc(TIKTOK_CC_DAYS),
    queryFn: () => fetchTiktokCcTrends(TIKTOK_CC_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        return await collectTiktokCcFromChrome(setRunId, controller.signal);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    onSuccess: (result) => {
      const failed = result.errors.length;
      const regionSuffix = result.region ? ` (${result.region})` : '';
      if (failed === 0) {
        toast.success(`틱톡 수집 완료 · ${formatNumber(result.collected)}건 저장${regionSuffix}`);
      } else {
        toast.warning(`틱톡 수집 완료 · ${formatNumber(result.collected)}건 저장 · ${failed}개 타깃 실패`);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trendTiktokCc(TIKTOK_CC_DAYS) });
    },
    onError: async (error) => {
      if (error instanceof TrendExtensionError && error.code === 'collection_aborted') return;
      if (error instanceof TrendExtensionError && error.runId) setRunId(error.runId);
      if (error instanceof TrendExtensionError && error.code === 'extension_missing') {
        const missing = await recordMissingBrowserCollection('sourcing.tiktok_cc_trend', {});
        setRunId(missing.runId);
      }
      toast.error(error instanceof Error ? error.message : '틱톡 수집 실패');
    },
  });

  const session = useBrowserCollectionSession(runId, { enabled: !collectMutation.isPending });

  useEffect(() => () => {
    // 페이지가 사라져도 확장 run 은 계속한다. 웹 관찰만 정리한다.
    abortRef.current?.abort();
  }, []);

  const running = collectMutation.isPending;

  return (
    <div className="space-y-3">
      {session.data && (
        <BrowserCollectionRunControls
          session={session.data}
          onWebRestart={async () => {
            await collectMutation.mutateAsync();
          }}
        />
      )}
      <ViewCard
        icon={Hash}
        title="틱톡 크리에이티브 센터 트렌드"
        subtitle="국가별 인기 해시태그·키워드·상품 · 로그인된 크리에이티브 센터 확장 수집"
        state={query}
        isEmpty={(query.data?.regions.length ?? 0) === 0}
        emptyHint="아직 틱톡 수집분이 없습니다. 시드에 '틱톡' 태그를 켜고 아래 '틱톡 수집'을 실행하세요."
        badge={query.data?.capturedAt
          ? `저장 ${formatDateTime(query.data.capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
          : undefined}
        action={
          <button
            type="button"
            onClick={() => collectMutation.mutate()}
            disabled={running}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              'transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none',
            )}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {running ? '수집 중…' : '틱톡 수집'}
          </button>
        }
      >
        <div className="space-y-4 px-5 py-4">
          {query.data?.regions.map((region) => (
            <TiktokCcRegionBlock key={region.region} region={region} />
          ))}
        </div>
      </ViewCard>
    </div>
  );
}

function TiktokCcRegionBlock({ region }: { region: TiktokCcRegionView }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{region.region}</span>
        <span className="text-[var(--text-tertiary)]">{formatNumber(region.items.length)}건</span>
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {region.items.slice(0, 24).map((item) => {
          const typeMeta = TIKTOK_TREND_TYPE_META[item.trendType];
          const content = (
            <>
              <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-[var(--text-tertiary)]">
                {item.rank ?? '·'}
              </span>
              <span className={cn('shrink-0 rounded px-1 py-0.5 text-[9px] font-bold', typeMeta.className)}>
                {typeMeta.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                {item.label ?? item.entityKey}
              </span>
              {item.newlyRanked && (
                <span className="shrink-0 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-bold text-purple-700">신규</span>
              )}
              {item.growthPct !== null && (
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-emerald-600">
                  +{formatNumber(item.growthPct)}%
                </span>
              )}
            </>
          );
          return (
            <li key={`${item.trendType}-${item.entityKey}`}>
              {item.sourceUrl ? (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1.5 hover:border-purple-300 hover:bg-purple-50"
                >
                  {content}
                </a>
              ) : (
                <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1.5">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
      icon={TrendingUp}
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

  const [douyinOnly, setDouyinOnly] = useState(false);
  const allOffers = query.data?.offers ?? [];
  const douyinCount = allOffers.filter((offer) => isDouyinTrendSourceKeyword(offer.sourceKeyword)).length;
  const offers = douyinOnly
    ? allOffers.filter((offer) => isDouyinTrendSourceKeyword(offer.sourceKeyword))
    : allOffers;

  return (
    <ViewCard
      icon={Flame}
      title="1688 검색 반응 상위"
      subtitle="1688 검색 결과를 거래 표시값순으로 정렬 · 공식 랭킹 아님"
      state={query}
      isEmpty={(query.data?.offers.length ?? 0) === 0}
      emptyHint="1688 데이터가 없습니다. 최근 수집 결과에서 로그인·슬라이더 검증 오류를 확인해주세요."
      badge={query.data?.capturedAt
        ? `저장 ${formatDateTime(query.data.capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : undefined}
    >
      {allOffers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-2.5">
          <button
            type="button"
            onClick={() => setDouyinOnly((value) => !value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition',
              douyinOnly
                ? 'bg-rose-500 text-white ring-rose-500'
                : 'bg-[var(--surface)] text-[var(--text-secondary)] ring-[var(--border)] hover:text-[var(--text-primary)]',
            )}
          >
            도우인 트렌드만
            <span className="tabular-nums">{douyinCount}</span>
          </button>
          <span className="text-[11px] leading-4 text-[var(--text-tertiary)]">
            도우인 인기 키워드로 1688 검색 · 라이브 도우인 아님
          </span>
        </div>
      )}
      {douyinOnly && offers.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-tertiary)]">
          아직 도우인 트렌드 키워드의 1688 수집 결과가 없습니다. 트렌드 수집을 한 번 실행해보세요.
        </p>
      ) : (
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {offers.map((offer) => (
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
              {isDouyinTrendSourceKeyword(offer.sourceKeyword) && (
                <span className="absolute right-2 top-2 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  도우인
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
      )}
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
  action,
  emptyHint,
  state,
  isEmpty,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  badge?: string;
  action?: ReactNode;
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
        {(badge || action) && (
          <div className="flex shrink-0 items-center gap-2">
            {badge && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
                {badge}
              </span>
            )}
            {action}
          </div>
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
