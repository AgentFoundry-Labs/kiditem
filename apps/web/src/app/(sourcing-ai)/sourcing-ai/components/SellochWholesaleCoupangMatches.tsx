'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  ImageIcon,
  KeyRound,
  Loader2,
  PackageSearch,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-extension';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import {
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  scoreImageSearchOffer,
  selectBestImageSearchOffer,
  type CoupangImageSearchRow,
  type ImageSearchOffer,
} from '../lib/coupang-1688-matching';
import {
  get1688ImageSearchStatus,
  search1688ByImage,
  type Search1688ImageResponse,
} from '../lib/1688-image-search-api';
import { append1688NewProductSnapshot } from '../lib/1688-new-product-snapshot';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import { SellochWholesaleOfferGrid } from './SellochWholesaleOfferGrid';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

const IMAGE_SEARCH_LAUNCH_INTERVAL_MS = 500;
const IMAGE_SEARCH_RESULT_LIMIT = 18;
const IMAGE_SEARCH_DAILY_CACHE_PREFIX = 'kiditem:sourcing-ai:1688-image-search:daily:';

type TodayRecommendationSnapshotPayload = Record<string, unknown> & {
  result?: {
    rows?: TodayRecommendationRow[];
  };
};

type ImageSearchState =
  | { status: 'loading' }
  | { status: 'success'; result: Search1688ImageResponse }
  | { status: 'error'; message: string };

type ImageSearchAvailability =
  | { status: 'checking' }
  | { status: 'ready'; configured: boolean }
  | { status: 'error'; message: string };

type CachedImageSearchState = Exclude<ImageSearchState, { status: 'loading' }>;

type DailyImageSearchCache = {
  dateKey: string;
  states: Record<string, CachedImageSearchState>;
};

export function SellochWholesaleCoupangMatches() {
  const localRows = useTodayRecommendationRows();
  const [snapshotRows, setSnapshotRows] = useState<TodayRecommendationRow[]>([]);
  const [imageSearches, setImageSearches] = useState<Record<string, ImageSearchState>>({});
  const [imageSearchAvailability, setImageSearchAvailability] = useState<ImageSearchAvailability>({ status: 'checking' });
  const autoRequestedIds = useRef<Set<string>>(new Set());
  const autoSearchTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const coupangRows = localRows.length > 0 ? localRows : snapshotRows;
  const matches = useMemo(
    () => buildCoupangImageSearchRows({ coupangRows, limit: 24 }),
    [coupangRows],
  );
  const canRunImageSearch = imageSearchAvailability.status === 'ready' && imageSearchAvailability.configured;

  const runImageSearch = useCallback(async (match: CoupangImageSearchRow) => {
    if (!canRunImageSearch) {
      setImageSearches((prev) => ({
        ...prev,
        [match.id]: {
          status: 'error',
          message: imageSearchUnavailableMessage(imageSearchAvailability),
        },
      }));
      return;
    }

    const imageUrl = resolveCoupangCatalogImageUrl(match.coupangProduct.imagePath);
    if (!imageUrl) {
      setImageSearches((prev) => ({
        ...prev,
        [match.id]: { status: 'error', message: '쿠팡 상품 이미지가 없어 1688 매칭을 실행할 수 없습니다.' },
      }));
      return;
    }

    setImageSearches((prev) => ({ ...prev, [match.id]: { status: 'loading' } }));
    try {
      const result = await search1688ByImage({
        imageUrl,
        keyword: match.searchQuery,
        maxResults: IMAGE_SEARCH_RESULT_LIMIT,
      });
      void append1688NewProductSnapshot({
        source: '1688_image_match',
        keyword: match.searchQuery,
        items: result.items.map((item) => {
          const offer = buildImageSearchOffer(item, match.targetSalePriceKrw);
          return {
            ...item,
            keyword: match.searchQuery,
            imageMatchScore: item.score,
            targetSalePriceKrw: match.targetSalePriceKrw,
            landedCostKrw: offer.landedCostKrw,
            estimatedProfitKrw: offer.estimatedProfitKrw,
            estimatedMarginRate: offer.estimatedMarginRate,
            matchedCoupang: {
              productId: match.coupangProduct.productId,
              productName: match.coupangProduct.productName,
              primaryKeyword: match.coupangProduct.primaryKeyword,
              keywords: match.coupangProduct.keywords,
              score: match.coupangProduct.score,
              grade: match.coupangProduct.grade,
              salePrice: match.coupangProduct.salePrice ?? match.targetSalePriceKrw,
              salesLast3d: match.coupangProduct.salesLast3d,
              salesLast28d: match.coupangProduct.salesLast28d ?? 0,
              reviews: match.coupangProduct.ratingCount ?? 0,
              marketReaction: match.coupangProduct.marketReactionSignal,
              threeDayValidation: match.coupangProduct.newEntrySignal,
              matchScore: item.score,
            },
          };
        }),
      }).catch(() => undefined);
      const nextState: CachedImageSearchState = { status: 'success', result };
      saveDailyImageSearchState(match.id, nextState);
      setImageSearches((prev) => ({ ...prev, [match.id]: nextState }));
    } catch (error) {
      const nextState: CachedImageSearchState = {
        status: 'error',
        message: formatImageSearchError(error),
      };
      saveDailyImageSearchState(match.id, nextState);
      setImageSearches((prev) => ({
        ...prev,
        [match.id]: nextState,
      }));
    }
  }, [canRunImageSearch, imageSearchAvailability]);

  const clearAutoSearchTimers = useCallback(() => {
    for (const timer of autoSearchTimers.current) clearTimeout(timer);
    autoSearchTimers.current = [];
  }, []);

  const scheduleImageSearches = useCallback((targetMatches: CoupangImageSearchRow[]) => {
    if (!canRunImageSearch) return;
    targetMatches.forEach((match, index) => {
      autoRequestedIds.current.add(match.id);
      const timer = setTimeout(() => {
        void runImageSearch(match);
      }, index * IMAGE_SEARCH_LAUNCH_INTERVAL_MS);
      autoSearchTimers.current.push(timer);
    });
  }, [canRunImageSearch, runImageSearch]);

  const rerunAllSearches = useCallback(() => {
    if (!canRunImageSearch) return;
    clearAutoSearchTimers();
    autoRequestedIds.current.clear();
    clearDailyImageSearchCache();
    setImageSearches({});
    scheduleImageSearches(matches);
  }, [canRunImageSearch, clearAutoSearchTimers, matches, scheduleImageSearches]);

  useEffect(() => {
    if (matches.length === 0) return;
    const cached = loadDailyImageSearchCache();
    const cachedStates = Object.fromEntries(
      matches
        .map((match) => [match.id, cached.states[match.id]] as const)
        .filter((entry): entry is [string, CachedImageSearchState] => Boolean(entry[1])),
    );
    if (Object.keys(cachedStates).length === 0) return;

    Object.keys(cachedStates).forEach((matchId) => autoRequestedIds.current.add(matchId));
    setImageSearches((prev) => ({ ...cachedStates, ...prev }));
  }, [matches]);

  useEffect(() => {
    if (!canRunImageSearch) return;
    const pendingMatches = matches.filter((match) => !autoRequestedIds.current.has(match.id));
    scheduleImageSearches(pendingMatches);
  }, [canRunImageSearch, matches, scheduleImageSearches]);

  useEffect(() => () => {
    clearAutoSearchTimers();
  }, [clearAutoSearchTimers]);

  useEffect(() => {
    let active = true;
    void get1688ImageSearchStatus()
      .then((status) => {
        if (active) setImageSearchAvailability({ status: 'ready', configured: status.configured });
      })
      .catch((error) => {
        if (active) setImageSearchAvailability({ status: 'error', message: formatImageSearchError(error) });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (localRows.length > 0) return () => {
      active = false;
    };

    void getTodaySourcingWorkspaceSnapshot<TodayRecommendationSnapshotPayload>('today_recommendations')
      .then(({ snapshot }) => {
        const rows = snapshot?.payload?.result?.rows;
        if (active && Array.isArray(rows)) setSnapshotRows(rows);
      })
      .catch(() => {
        if (active) setSnapshotRows([]);
      });

    return () => {
      active = false;
    };
  }, [localRows.length]);

  const finishedSearchCount = matches.filter((match) => {
    const state = imageSearches[match.id];
    return state?.status === 'success' || state?.status === 'error';
  }).length;
  const loadingSearchCount = matches.filter((match) => imageSearches[match.id]?.status === 'loading').length;
  const collecting = canRunImageSearch && matches.length > 0 && finishedSearchCount < matches.length;

  return (
    <section className="overflow-hidden rounded-[18px] border border-[#eef1f5] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#eef1f5] p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#eef2ff] px-3 text-xs font-black text-[#5b50d6]">
              <ImageIcon size={14} />
              1688 이미지 매칭
            </div>
            <h2 className="mt-3 text-xl font-black text-[#111827]">쿠팡 판매상품 매칭</h2>
            <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-[#667085]">
              오늘 추천/Wing 판매 후보의 이미지와 검색어를 기준으로 1688 직접 검색 결과를 붙입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={rerunAllSearches}
            disabled={!canRunImageSearch || matches.length === 0 || collecting}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-4 text-xs font-black text-[#4b5563] transition hover:border-[#b5482b] hover:text-[#b5482b] disabled:opacity-60"
          >
            {loadingSearchCount > 0 ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            전체 다시 수집
          </button>
        </div>

        {canRunImageSearch && matches.length > 0 && (
          <div className={cn(
            'mt-4 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-black',
            collecting ? 'bg-[#eef2ff] text-[#5b50d6]' : 'bg-green-100 text-green-700',
          )}>
            {collecting ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
            {collecting
              ? `수집중 ${formatNumber(finishedSearchCount)}/${formatNumber(matches.length)}`
              : `수집 완료 ${formatNumber(matches.length)}개`}
          </div>
        )}

        {!canRunImageSearch && (
          <ImageSearchSetupNotice availability={imageSearchAvailability} />
        )}
      </div>

      {matches.length === 0 ? (
        <EmptyMatches />
      ) : (
        <div className="divide-y divide-[#eef1f5]">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              searchState={imageSearches[match.id]}
              onSearch={runImageSearch}
              availability={imageSearchAvailability}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ImageSearchSetupNotice({ availability }: { availability: ImageSearchAvailability }) {
  const checking = availability.status === 'checking';
  return (
    <div className={cn(
      'mt-5 rounded-xl border p-4',
      checking ? 'border-[#eef1f5] bg-[#f8fafc]' : 'border-red-200 bg-red-50',
    )}>
      <div className="flex items-start gap-3">
        {checking ? (
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[#667085]" />
        ) : (
          <KeyRound size={18} className="mt-0.5 shrink-0 text-red-700" />
        )}
        <div>
          <h3 className="text-sm font-black text-[#111827]">
            {checking ? '1688 매칭 연결 확인 중' : '1688 매칭 연결 전입니다'}
          </h3>
          <p className={cn('mt-1 text-xs font-bold leading-5', checking ? 'text-[#667085]' : 'text-red-800')}>
            {imageSearchUnavailableMessage(availability)}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyMatches() {
  return (
    <section className="bg-white p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#f8fafc] text-[#9ca3af]">
        <PackageSearch size={24} />
      </div>
      <h2 className="mt-4 text-lg font-black text-[#111827]">매칭할 쿠팡 상품이 없습니다</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-[#667085]">
        오늘의 추천에서 Wing 상품 검증을 실행하면 3일 판매 추적이 잡힌 쿠팡 후보를 이곳에서 1688 후보로 확인합니다.
      </p>
    </section>
  );
}

function MatchCard({
  match,
  searchState,
  onSearch,
  availability,
}: {
  match: CoupangImageSearchRow;
  searchState?: ImageSearchState;
  onSearch: (match: CoupangImageSearchRow) => void;
  availability: ImageSearchAvailability;
}) {
  const row = match.coupangProduct;
  const coupangImageUrl = resolveCoupangCatalogImageUrl(row.imagePath);
  const offers = searchState?.status === 'success'
    ? searchState.result.items.map((item) => buildImageSearchOffer(item, match.targetSalePriceKrw))
    : [];

  return (
    <article className="bg-white p-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <section className="grid h-full gap-4 rounded-2xl border border-[#e5eaf5] bg-[#fbfcfe] p-4 md:grid-cols-[132px_minmax(0,1fr)]">
          <div className="flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-2xl bg-[#f3f4f6] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            {coupangImageUrl ? (
              <img src={coupangImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <PackageSearch size={30} className="text-[#9ca3af]" />
            )}
          </div>
          <div className="flex h-full min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#fff4ee] px-2 py-1 text-[11px] font-black text-[#d94112]">쿠팡 판매상품</span>
              <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[11px] font-black text-[#5b50d6]">{row.grade}</span>
            </div>
            <div className="mt-3 min-w-0">
              <h3 className="line-clamp-2 text-lg font-black leading-6 text-[#111827]">{row.productName}</h3>
              <p className="mt-1 truncate text-sm font-bold text-[#8a94a6]">{row.keywords.slice(0, 3).join(', ')}</p>
            </div>
            <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-2">
              <MiniMetric label="3일 판매" value={`${formatNumber(row.salesLast3d)}개`} strong />
              <MiniMetric label="쿠팡가" value={`${formatKRW(match.targetSalePriceKrw)}원`} />
              <MiniMetric label="리뷰" value={`${formatNumber(row.ratingCount)}개`} />
              <MiniMetric label="점수" value={`${formatNumber(row.score)}점`} />
            </div>
          </div>
        </section>

        <ImageSearchPanel
          match={match}
          searchState={searchState}
          offers={offers}
          onSearch={onSearch}
          availability={availability}
        />
      </div>
      {offers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#eef1f5] bg-[#fbfcfe] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md bg-green-100 px-2 py-1 text-[11px] font-black text-green-700">
              다른 1688 상품
            </span>
            <a
              href={match.searchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe2ea] bg-white px-3 text-[11px] font-black text-[#4b5563] hover:border-[#5b50d6] hover:text-[#5b50d6]"
            >
              <ExternalLink size={13} />
              검색 전체 열기
            </a>
          </div>
          <SellochWholesaleOfferGrid
            offers={offers}
            searchUrl={match.searchUrl}
            density="compact"
            inlineLimit={6}
            expandTitle={`${match.coupangProduct.productName} · 다른 1688 상품`}
          />
        </div>
      )}
    </article>
  );
}

function ImageSearchPanel({
  match,
  searchState,
  offers,
  onSearch,
  availability,
}: {
  match: CoupangImageSearchRow;
  searchState?: ImageSearchState;
  offers: ImageSearchOffer[];
  onSearch: (match: CoupangImageSearchRow) => void;
  availability: ImageSearchAvailability;
}) {
  const canSearch = availability.status === 'ready' && availability.configured;
  const bestOffer = selectBestImageSearchOffer(offers);
  const bestScore = bestOffer ? scoreImageSearchOffer(bestOffer) : null;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#e5eaf5] bg-[#fbfcfe] p-4">
      {!bestOffer && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSearch(match)}
            disabled={!canSearch || searchState?.status === 'loading'}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-3 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed] disabled:opacity-60"
          >
            {searchState?.status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            매칭 다시
          </button>
        </div>
      )}

      {!canSearch && (
        <StatePanel
          icon={availability.status === 'checking' ? Loader2 : KeyRound}
          title={availability.status === 'checking' ? '1688 매칭 설정 확인 중' : '1688 매칭 연결 필요'}
          body={imageSearchUnavailableMessage(availability)}
          tone={availability.status === 'checking' ? 'muted' : 'danger'}
          spin={availability.status === 'checking'}
        />
      )}

      {canSearch && !searchState && (
        <StatePanel
          icon={ImageIcon}
          title="자동 수집 대기"
          body="전체 상품을 시간 간격을 두고 자동 수집합니다. 곧 1688 상품을 불러옵니다."
        />
      )}

      {searchState?.status === 'loading' && (
        <StatePanel
          icon={Loader2}
          title="1688 매칭 중"
          body="쿠팡 상품 이미지로 AlphaShop 방식의 1688 후보를 불러오고 있습니다."
          spin
        />
      )}

      {searchState?.status === 'error' && (
        <StatePanel
          icon={AlertCircle}
          title="1688 매칭 실패"
          body={searchState.message}
          tone="danger"
        />
      )}

      {searchState?.status === 'success' && offers.length === 0 && (
        <StatePanel
          icon={PackageSearch}
          title="1688 매칭 결과 없음"
          body="찾은 후보가 없습니다. 상품 키워드를 바꿔 다시 확인해 주세요."
          tone="muted"
        />
      )}

      {bestOffer && (
        <BestImageSearchOfferCard
          offer={bestOffer}
          score={bestScore}
          onRetry={() => onSearch(match)}
          retryDisabled={!canSearch || searchState?.status === 'loading'}
          retryLoading={searchState?.status === 'loading'}
        />
      )}
    </section>
  );
}

function BestImageSearchOfferCard({
  offer,
  score,
  onRetry,
  retryDisabled,
  retryLoading,
}: {
  offer: ImageSearchOffer;
  score: number | null;
  onRetry: () => void;
  retryDisabled: boolean;
  retryLoading: boolean;
}) {
  const priceKrw = offer.priceCny == null ? null : Math.round(offer.priceCny * 190);
  const sourceFactory = (offer.supplierTags ?? []).some((tag) => /원천|공장|factory|源头|实力/i.test(tag));

  return (
    <div className="grid h-full flex-1 gap-4 md:grid-cols-[132px_minmax(0,1fr)]">
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="group relative flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-xl bg-[#f1f5fb]"
      >
        {offer.imageUrl ? (
          <img src={offer.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <ExternalLink size={28} className="text-[#9ca3af]" />
        )}
      </a>

      <div className="flex h-full min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-green-100 px-2 py-1 text-[11px] font-black text-green-700">1688 매칭상품</span>
          {score != null && (
            <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[11px] font-black text-[#5b50d6]">{formatNumber(score)}점</span>
          )}
          <span className="rounded-full bg-[#fff4ee] px-2 py-1 text-[10px] font-black text-[#d94112]">
            {offer.priceCny == null ? '단가 미확인' : `¥${offer.priceCny.toFixed(2)}`}
          </span>
          {sourceFactory && (
            <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-black text-green-700">원천 공장</span>
          )}
          <a
            href={offer.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#5b52e6] px-2.5 text-[10px] font-black text-white transition hover:bg-[#4b43d8]"
          >
            <ExternalLink size={12} />
            1688 상품 열기
          </a>
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#dbe2ea] bg-white px-2.5 text-[10px] font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed] disabled:opacity-60"
          >
            {retryLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            매칭 다시
          </button>
        </div>

        <h4 className="mt-2 line-clamp-2 text-base font-black leading-6 text-[#111827]">{offer.title}</h4>
        {offer.supplierName && (
          <p className="mt-1 truncate text-xs font-black text-[#667085]">{offer.supplierName}</p>
        )}

        <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-3">
          <MiniMetric label="1688 원가" value={priceKrw == null ? '-' : `${formatKRW(priceKrw)}원`} strong />
          <MiniMetric label="예상 이익" value={offer.estimatedProfitKrw == null ? '-' : `${formatKRW(offer.estimatedProfitKrw)}원`} />
          <MiniMetric label="예상 마진" value={offer.estimatedMarginRate == null ? '-' : `${offer.estimatedMarginRate}%`} />
          <MiniMetric label="배송 이행률" value={offer.shippingFulfillmentRate ?? '-'} />
          <MiniMetric label="48시간 이내" value={offer.shippingPickupRate ?? '-'} />
          <MiniMetric label="판매량" value={offer.salesText ?? (offer.salesNum == null ? '-' : formatNumber(offer.salesNum))} />
        </div>

      </div>
    </div>
  );
}

function StatePanel({
  icon: Icon,
  title,
  body,
  tone = 'default',
  spin = false,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: 'default' | 'danger' | 'muted';
  spin?: boolean;
}) {
  return (
    <div className={cn(
      'mt-4 rounded-xl border p-4 text-sm',
      tone === 'danger' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[#eef1f5] bg-[#f8fafc] text-[#667085]',
      tone === 'muted' && 'border-dashed',
    )}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={cn('mt-0.5 shrink-0', spin && 'animate-spin')} />
        <div>
          <h4 className="font-black text-[#111827]">{title}</h4>
          <p className={cn('mt-1 text-xs font-bold leading-5', tone === 'danger' ? 'text-red-800' : 'text-[#667085]')}>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-[#f8fafc] px-3 py-2 ring-1 ring-[#eef1f5]', strong && 'bg-[#fff4ee] ring-[#ffd6c6]')}>
      <p className="text-[10px] font-bold text-[#9ca3af]">{label}</p>
      <p className={cn('mt-1 truncate text-sm font-black text-[#111827]', strong && 'text-[#d94112]')}>{value}</p>
    </div>
  );
}

function imageSearchUnavailableMessage(availability: ImageSearchAvailability): string {
  if (availability.status === 'checking') {
    return '백엔드에서 1688 직접 매칭 설정을 확인하고 있습니다.';
  }
  if (availability.status === 'error') {
    return availability.message;
  }
  if (!availability.configured) {
    return '1688 직접 검색 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  return '1688 직접 매칭을 실행할 수 있습니다.';
}

function loadDailyImageSearchCache(): DailyImageSearchCache {
  const dateKey = todayLocalDateKey();
  if (typeof window === 'undefined') return { dateKey, states: {} };

  try {
    const raw = window.localStorage.getItem(dailyImageSearchCacheKey(dateKey));
    if (!raw) return { dateKey, states: {} };
    const parsed = JSON.parse(raw) as Partial<DailyImageSearchCache>;
    if (parsed.dateKey !== dateKey || !parsed.states || typeof parsed.states !== 'object') {
      return { dateKey, states: {} };
    }
    return {
      dateKey,
      states: Object.fromEntries(
        Object.entries(parsed.states).filter((entry): entry is [string, CachedImageSearchState] => {
          const state = entry[1] as Partial<ImageSearchState>;
          return state?.status === 'success' || state?.status === 'error';
        }),
      ),
    };
  } catch {
    return { dateKey, states: {} };
  }
}

function saveDailyImageSearchState(matchId: string, state: CachedImageSearchState) {
  if (typeof window === 'undefined') return;
  const cache = loadDailyImageSearchCache();
  const nextCache: DailyImageSearchCache = {
    ...cache,
    states: {
      ...cache.states,
      [matchId]: state,
    },
  };

  try {
    window.localStorage.setItem(dailyImageSearchCacheKey(cache.dateKey), JSON.stringify(nextCache));
  } catch {
    void 0;
  }
}

function clearDailyImageSearchCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(dailyImageSearchCacheKey(todayLocalDateKey()));
  } catch {
    void 0;
  }
}

function dailyImageSearchCacheKey(dateKey: string): string {
  return `${IMAGE_SEARCH_DAILY_CACHE_PREFIX}${dateKey}`;
}

function todayLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatImageSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('keyword helper')) {
    return '1688 매칭에 사용할 검색어가 없어 실행할 수 없습니다.';
  }
  return message;
}
