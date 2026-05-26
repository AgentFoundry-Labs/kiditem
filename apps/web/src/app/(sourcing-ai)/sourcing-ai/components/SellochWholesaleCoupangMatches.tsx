'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ExternalLink,
  ImageIcon,
  KeyRound,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-extension';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import {
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  type CoupangImageSearchRow,
} from '../lib/coupang-1688-matching';
import {
  get1688ImageSearchStatus,
  search1688ByImage,
  type Search1688ImageResponse,
} from '../lib/1688-image-search-api';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

const AUTO_IMAGE_SEARCH_LIMIT = 8;
const IMAGE_SEARCH_RESULT_LIMIT = 8;

type TodayRecommendationSnapshotPayload = Record<string, unknown> & {
  rows?: TodayRecommendationRow[];
};

type ImageSearchState =
  | { status: 'loading' }
  | { status: 'success'; result: Search1688ImageResponse }
  | { status: 'error'; message: string };

type ImageSearchAvailability =
  | { status: 'checking' }
  | { status: 'ready'; configured: boolean }
  | { status: 'error'; message: string };

export function SellochWholesaleCoupangMatches() {
  const localRows = useTodayRecommendationRows();
  const [snapshotRows, setSnapshotRows] = useState<TodayRecommendationRow[]>([]);
  const [imageSearches, setImageSearches] = useState<Record<string, ImageSearchState>>({});
  const [imageSearchAvailability, setImageSearchAvailability] = useState<ImageSearchAvailability>({ status: 'checking' });
  const autoRequestedIds = useRef<Set<string>>(new Set());

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
        [match.id]: { status: 'error', message: '쿠팡 상품 이미지가 없어 1688 이미지검색을 실행할 수 없습니다.' },
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
      setImageSearches((prev) => ({ ...prev, [match.id]: { status: 'success', result } }));
    } catch (error) {
      setImageSearches((prev) => ({
        ...prev,
        [match.id]: {
          status: 'error',
          message: formatImageSearchError(error),
        },
      }));
    }
  }, [canRunImageSearch, imageSearchAvailability]);

  const rerunTopSearches = useCallback(() => {
    if (!canRunImageSearch) return;
    for (const match of matches.slice(0, AUTO_IMAGE_SEARCH_LIMIT)) {
      autoRequestedIds.current.add(match.id);
      void runImageSearch(match);
    }
  }, [canRunImageSearch, matches, runImageSearch]);

  useEffect(() => {
    if (!canRunImageSearch) return;
    for (const match of matches.slice(0, AUTO_IMAGE_SEARCH_LIMIT)) {
      if (autoRequestedIds.current.has(match.id)) continue;
      autoRequestedIds.current.add(match.id);
      void runImageSearch(match);
    }
  }, [canRunImageSearch, matches, runImageSearch]);

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
        const rows = snapshot?.payload?.rows;
        if (active && Array.isArray(rows)) setSnapshotRows(rows);
      })
      .catch(() => {
        if (active) setSnapshotRows([]);
      });

    return () => {
      active = false;
    };
  }, [localRows.length]);

  const completedSearchCount = matches.filter((match) => imageSearches[match.id]?.status === 'success').length;
  const loadingSearchCount = matches.filter((match) => imageSearches[match.id]?.status === 'loading').length;
  const pendingSearchCount = matches.filter((match) => !imageSearches[match.id]).length;
  const resultCandidateCount = matches.reduce((sum, match) => {
    const state = imageSearches[match.id];
    return sum + (state?.status === 'success' ? state.result.items.length : 0);
  }, 0);

  return (
    <section className="space-y-4">
      <div className="rounded-[18px] border border-[#eef1f5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#eef2ff] px-3 text-xs font-black text-[#5b50d6]">
              <ImageIcon size={14} />
              쿠팡 이미지로 1688 찾기
            </div>
            <h2 className="mt-3 text-xl font-black text-[#111827]">쿠팡에서 팔리는 상품을 1688 이미지검색으로 매칭</h2>
            <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-[#667085]">
              오늘 추천/Wing 판매 후보의 쿠팡 상품 이미지를 1688 이미지검색에 넣고, 실제 검색 결과를 오른쪽에 바로 보여줍니다.
            </p>
          </div>
          <button
            type="button"
            onClick={rerunTopSearches}
            disabled={!canRunImageSearch || matches.length === 0 || loadingSearchCount > 0}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-4 text-xs font-black text-[#4b5563] transition hover:border-[#b5482b] hover:text-[#b5482b] disabled:opacity-60"
          >
            {loadingSearchCount > 0 ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            상위 {AUTO_IMAGE_SEARCH_LIMIT}개 이미지검색 다시
          </button>
        </div>

        {!canRunImageSearch && (
          <ImageSearchSetupNotice availability={imageSearchAvailability} />
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <SummaryTile icon={TrendingUp} label="쿠팡 판매 후보" value={`${formatNumber(matches.length)}개`} />
          <SummaryTile icon={ImageIcon} label="이미지검색 완료" value={`${formatNumber(completedSearchCount)}개`} />
          <SummaryTile icon={PackageSearch} label="1688 결과 후보" value={`${formatNumber(resultCandidateCount)}개`} />
          <SummaryTile icon={Search} label="검색 대기" value={`${formatNumber(pendingSearchCount)}개`} />
        </div>
      </div>

      {matches.length === 0 ? (
        <EmptyMatches />
      ) : (
        <div className="grid gap-4">
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

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-lg bg-[#f8fafc] p-4 ring-1 ring-[#eef1f5]">
      <div className="flex items-center gap-2 text-xs font-bold text-[#8a94a6]">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-2 text-xl font-black text-[#111827]">{value}</p>
    </article>
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
            {checking ? '1688 이미지검색 연결 확인 중' : '1688 이미지검색 연결 전입니다'}
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
    <section className="rounded-[18px] border border-dashed border-[#dbe2ea] bg-white p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#f8fafc] text-[#9ca3af]">
        <PackageSearch size={24} />
      </div>
      <h2 className="mt-4 text-lg font-black text-[#111827]">이미지검색할 쿠팡 판매 후보가 없습니다</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-[#667085]">
        오늘의 추천에서 Wing 상품 검증을 실행하면 3일 판매 추적이 잡힌 쿠팡 후보를 이곳에서 1688 이미지검색으로 확인합니다.
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

  return (
    <article className="overflow-hidden rounded-[18px] border border-[#eef1f5] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <div className="grid gap-4 border-b border-[#eef1f5] p-4 md:grid-cols-[104px_1fr] xl:border-b-0 xl:border-r">
          <div className="flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-xl bg-[#f3f4f6]">
            {coupangImageUrl ? (
              <img src={coupangImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <PackageSearch size={24} className="text-[#9ca3af]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#fff4ee] px-2 py-1 text-[11px] font-black text-[#d94112]">쿠팡 판매상품</span>
              <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[11px] font-black text-[#5b50d6]">{row.grade}</span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-base font-black leading-6 text-[#111827]">{row.productName}</h3>
            <p className="mt-1 text-xs font-bold text-[#8a94a6]">{row.keywords.slice(0, 3).join(', ')}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <MiniMetric label="3일 판매" value={`${formatNumber(row.salesLast3d)}개`} strong />
              <MiniMetric label="쿠팡가" value={`${formatKRW(match.targetSalePriceKrw)}원`} />
              <MiniMetric label="리뷰" value={`${formatNumber(row.ratingCount)}개`} />
              <MiniMetric label="점수" value={`${formatNumber(row.score)}점`} />
            </div>
          </div>
        </div>

        <ImageSearchPanel
          match={match}
          searchState={searchState}
          onSearch={onSearch}
          availability={availability}
        />
      </div>
    </article>
  );
}

function ImageSearchPanel({
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
  const canSearch = availability.status === 'ready' && availability.configured;
  const offers = searchState?.status === 'success'
    ? searchState.result.items.map((item) => buildImageSearchOffer(item, match.targetSalePriceKrw)).slice(0, 3)
    : [];

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-md bg-green-100 px-2 py-1 text-[11px] font-black text-green-700">1688 이미지검색 결과</span>
        <button
          type="button"
          onClick={() => onSearch(match)}
          disabled={!canSearch || searchState?.status === 'loading'}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-3 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed] disabled:opacity-60"
        >
          {searchState?.status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          이미지검색 다시
        </button>
      </div>

      <p className="mt-3 text-xs font-black text-[#5b50d6]">검색어 보조: {match.searchQuery}</p>

      {!canSearch && (
        <StatePanel
          icon={availability.status === 'checking' ? Loader2 : KeyRound}
          title={availability.status === 'checking' ? '1688 이미지검색 설정 확인 중' : 'TMAPI 토큰 설정 필요'}
          body={imageSearchUnavailableMessage(availability)}
          tone={availability.status === 'checking' ? 'muted' : 'danger'}
          spin={availability.status === 'checking'}
        />
      )}

      {canSearch && !searchState && (
        <StatePanel
          icon={ImageIcon}
          title="이미지검색 대기"
          body="상위 후보는 자동으로 검색하고, 나머지는 오른쪽 버튼으로 바로 검색할 수 있습니다."
        />
      )}

      {searchState?.status === 'loading' && (
        <StatePanel
          icon={Loader2}
          title="1688 이미지검색 중"
          body="쿠팡 이미지를 변환한 뒤 1688 이미지검색 결과를 불러오고 있습니다."
          spin
        />
      )}

      {searchState?.status === 'error' && (
        <StatePanel
          icon={AlertCircle}
          title="이미지검색 실패"
          body={searchState.message}
          tone="danger"
        />
      )}

      {searchState?.status === 'success' && offers.length === 0 && (
        <StatePanel
          icon={PackageSearch}
          title="1688 이미지검색 결과 없음"
          body="이미지로 찾은 후보가 없습니다. 상품 이미지나 키워드를 바꿔 다시 확인해 주세요."
          tone="muted"
        />
      )}

      {offers.length > 0 && (
        <div className="mt-4 space-y-3">
          {offers.map((offer) => (
            <div key={offer.id} className="rounded-xl border border-[#eef1f5] bg-[#fbfbfc] p-3">
              <div className="flex gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f3f4f6]">
                  {offer.imageUrl ? (
                    <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ExternalLink size={22} className="text-[#9ca3af]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#4b5563] ring-1 ring-[#e5e7eb]">
                      매칭 {formatNumber(offer.matchScore)}점
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#4b5563] ring-1 ring-[#e5e7eb]">
                      {offer.priceCny == null ? '단가 미확인' : `¥${offer.priceCny.toFixed(1)}`}
                    </span>
                  </div>
                  <h4 className="mt-2 line-clamp-2 text-sm font-black leading-5 text-[#111827]">{offer.title}</h4>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniMetric label="입고원가" value={offer.landedCostKrw == null ? '-' : `${formatKRW(offer.landedCostKrw)}원`} strong />
                <MiniMetric label="예상 이익" value={offer.estimatedProfitKrw == null ? '-' : `${formatKRW(offer.estimatedProfitKrw)}원`} />
                <MiniMetric label="예상 마진" value={offer.estimatedMarginRate == null ? '-' : `${offer.estimatedMarginRate}%`} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={offer.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2f80ed] px-3 text-xs font-black text-white transition hover:bg-[#256bd1]"
                >
                  <ExternalLink size={14} />
                  1688 상품 열기
                </a>
                <a
                  href={match.searchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-white px-3 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed]"
                >
                  키워드 검색 열기
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
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
    return '백엔드에서 1688 이미지검색 설정을 확인하고 있습니다.';
  }
  if (availability.status === 'error') {
    return availability.message;
  }
  if (!availability.configured) {
    return 'apps/server/.env 또는 서버 실행 환경에 TMAPI_TOKEN 값을 넣고 Nest 서버를 다시 시작하면 쿠팡 이미지로 1688 결과를 가져옵니다.';
  }
  return '1688 이미지검색을 실행할 수 있습니다.';
}

function formatImageSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('TMAPI_TOKEN')) {
    return 'TMAPI_TOKEN이 비어 있습니다. apps/server/.env 또는 서버 실행 환경에 토큰을 넣고 Nest 서버를 다시 시작해 주세요.';
  }
  return message;
}
