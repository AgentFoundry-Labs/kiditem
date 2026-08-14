'use client';

import { useCallback, useMemo } from 'react';
import type { Sourcing1688SearchObservation } from '@kiditem/shared/sourcing';
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  PackageSearch,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-presenter';
import { useSourcingRecommendations } from '../hooks/use-sourcing-workspace';
import { toTodayRecommendationRows } from '../lib/sourcing-recommendation-presenter';
import {
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  scoreImageSearchOffer,
  selectBestImageSearchOffer,
  type CoupangImageSearchRow,
  type ImageSearchOffer,
} from '../lib/coupang-1688-matching';
import { useSourcingOperationAction } from '../hooks/use-sourcing-operation-action';
import { useWholesale1688Results } from '../hooks/use-wholesale-1688-results';
import { wholesale1688ResultsQueryKey } from '../lib/wholesale-1688-results-api';
import { SourcingOperationRunPanel } from './SourcingOperationRunPanel';
import { SellochWholesaleOfferGrid } from './SellochWholesaleOfferGrid';

const IMAGE_SEARCH_BATCH_LIMIT = 24;

export function SellochWholesaleCoupangMatches() {
  const recommendationsQuery = useSourcingRecommendations('today');
  const coupangRows = useMemo(
    () => toTodayRecommendationRows(recommendationsQuery.data?.data?.items ?? []),
    [recommendationsQuery.data],
  );

  const matches = useMemo(
    () => buildCoupangImageSearchRows({
      coupangRows,
      limit: IMAGE_SEARCH_BATCH_LIMIT,
    }),
    [coupangRows],
  );
  const targetIds = useMemo(
    () => matches.map((match) => match.id).slice(0, IMAGE_SEARCH_BATCH_LIMIT),
    [matches],
  );
  const resultQuery = useWholesale1688Results({ targetIds });
  const snapshotQueryKey = wholesale1688ResultsQueryKey({ targetIds });
  const operationInput = useMemo(() => ({ targetIds }), [targetIds]);
  const operation = useSourcingOperationAction({
    operationKey: 'sourcing.match_wholesale_images',
    input: operationInput,
    snapshotQueryKey,
  });
  const collecting = operation.isStarting || isActiveOperation(operation.run?.status);
  const observationsByTargetId = useMemo(
    () => new Map(
      (resultQuery.data?.observations ?? [])
        .filter((observation) => observation.targetId !== null)
        .map((observation) => [observation.targetId as string, observation]),
    ),
    [resultQuery.data?.observations],
  );

  const runImageSearch = useCallback((match: CoupangImageSearchRow) => {
    void operation.start({ targetIds: [match.id] }, [snapshotQueryKey]);
  }, [operation, snapshotQueryKey]);

  const rerunAllSearches = useCallback(() => {
    if (targetIds.length === 0) return;
    void operation.start();
  }, [operation, targetIds.length]);

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
            disabled={targetIds.length === 0 || collecting}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-4 text-xs font-black text-[#4b5563] transition hover:border-[#b5482b] hover:text-[#b5482b] disabled:opacity-60"
          >
            {collecting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            전체 수집
          </button>
        </div>

        <SourcingOperationRunPanel
          run={operation.run}
          onCancel={() => { void operation.cancel(); }}
          onRetryAttention={() => { void operation.retryAttention(); }}
          isCancelling={operation.isCancelling}
          isRetrying={operation.isRetrying}
          className="mt-5"
        />
      </div>

      {matches.length === 0 ? (
        <EmptyMatches />
      ) : (
        <div className="divide-y divide-[#eef1f5]">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              observation={observationsByTargetId.get(match.id)}
              onSearch={runImageSearch}
              busy={collecting}
            />
          ))}
        </div>
      )}
    </section>
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
  observation,
  onSearch,
  busy,
}: {
  match: CoupangImageSearchRow;
  observation?: Sourcing1688SearchObservation;
  onSearch: (match: CoupangImageSearchRow) => void;
  busy: boolean;
}) {
  const row = match.coupangProduct;
  const coupangImageUrl = resolveCoupangCatalogImageUrl(row.imagePath);
  const offers = observation
    ? observation.items.map((item) => buildImageSearchOffer(item, match.targetSalePriceKrw))
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
          observation={observation}
          offers={offers}
          onSearch={onSearch}
          busy={busy}
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
  observation,
  offers,
  onSearch,
  busy,
}: {
  match: CoupangImageSearchRow;
  observation?: Sourcing1688SearchObservation;
  offers: ImageSearchOffer[];
  onSearch: (match: CoupangImageSearchRow) => void;
  busy: boolean;
}) {
  const bestOffer = selectBestImageSearchOffer(offers);
  const bestScore = bestOffer ? scoreImageSearchOffer(bestOffer) : null;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#e5eaf5] bg-[#fbfcfe] p-4">
      {!bestOffer && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSearch(match)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-3 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            매칭 다시
          </button>
        </div>
      )}

      {!busy && !observation && (
        <StatePanel
          icon={ImageIcon}
          title="저장된 매칭 결과 없음"
          body="전체 수집 또는 이 상품의 매칭 다시 버튼으로 새 Operation을 시작할 수 있습니다."
          tone="muted"
        />
      )}

      {busy && !observation && (
        <StatePanel
          icon={Loader2}
          title="1688 매칭 중"
          body="쿠팡 상품 이미지로 AlphaShop 방식의 1688 후보를 불러오고 있습니다."
          spin
        />
      )}

      {observation && offers.length === 0 && (
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
          retryDisabled={busy}
          retryLoading={busy}
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

function isActiveOperation(status: string | undefined): boolean {
  return status === 'queued' || status === 'running' || status === 'attention_required';
}
