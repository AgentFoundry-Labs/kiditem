'use client';

import { useState } from 'react';
import { ExternalLink, ShoppingCart, X } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

const CNY_TO_KRW = 190;

export interface WholesaleOfferGridItem {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  priceCny: number | null;
  landedCostKrw: number | null;
  matchScore?: number | null;
  estimatedProfitKrw?: number | null;
  estimatedMarginRate?: number | null;
  monthlySales?: number | null;
  supplierName?: string | null;
  supplierFactoryUrl?: string | null;
  supplierTags?: string[];
  purchaseTags?: string[];
  salesText?: string | null;
  salesNum?: number | null;
  minOrderQuantity?: number | null;
  shippingFulfillmentRate?: string | null;
  shippingPickupRate?: string | null;
  shipFrom?: string | null;
  serviceScore?: number | null;
  repurchaseRate?: string | null;
}

export function SellochWholesaleOfferGrid({
  offers,
  searchUrl,
  density = 'default',
  inlineLimit,
  expandTitle = '1688 후보 전체 보기',
}: {
  offers: WholesaleOfferGridItem[];
  searchUrl?: string;
  density?: 'default' | 'compact' | 'keyword' | 'catalog';
  inlineLimit?: number;
  expandTitle?: string;
}) {
  const [selectedOffer, setSelectedOffer] = useState<WholesaleOfferGridItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const displayOffers = inlineLimit == null ? offers : offers.slice(0, inlineLimit);
  const hiddenCount = Math.max(0, offers.length - displayOffers.length);

  return (
    <>
      <div className={cn(
        'mt-4 grid gap-3',
        density === 'compact'
          ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
          : density === 'keyword'
            ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
          : 'grid-cols-2',
      )}>
        {displayOffers.map((offer, index) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            density={density}
            rank={index + 1}
            onSelect={() => setSelectedOffer(offer)}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] text-xs font-black text-[#4b5563] transition hover:border-[#6d5dfc] hover:text-[#5b50d6]"
        >
          펼치기 · 나머지 {formatNumber(hiddenCount)}개 더 보기
        </button>
      )}

      {expanded && (
        <OfferListModal
          title={expandTitle}
          offers={offers}
          searchUrl={searchUrl}
          onClose={() => setExpanded(false)}
          onSelect={(offer) => {
            setExpanded(false);
            setSelectedOffer(offer);
          }}
        />
      )}

      {selectedOffer && (
        <OfferOrderModal
          offer={selectedOffer}
          searchUrl={searchUrl}
          onClose={() => setSelectedOffer(null)}
        />
      )}
    </>
  );
}

function OfferCard({
  offer,
  density,
  rank,
  onSelect,
}: {
  offer: WholesaleOfferGridItem;
  density: 'default' | 'compact' | 'keyword' | 'catalog';
  rank?: number;
  onSelect: () => void;
}) {
  const compact = density === 'compact' || density === 'keyword';
  const catalog = density === 'catalog';
  const priceKrw = offer.priceCny == null ? null : Math.round(offer.priceCny * CNY_TO_KRW);
  const salesLabel = offer.salesText || (offer.monthlySales == null ? null : formatNumber(offer.monthlySales));
  const primaryTags = [
    ...(offer.purchaseTags ?? []),
    offer.minOrderQuantity == null ? null : `최소 주문 수량 ${formatNumber(offer.minOrderQuantity)}개부터`,
  ].filter((tag): tag is string => Boolean(tag));
  const sourceFactory = (offer.supplierTags ?? []).some((tag) => /원천|공장|factory/i.test(tag));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group overflow-hidden border border-[#eef1f5] bg-white text-left transition hover:-translate-y-0.5 hover:border-[#6d5dfc] hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)]',
        compact ? 'rounded-lg' : 'rounded-xl',
      )}
    >
      <div className={cn('relative bg-[#eef1f5]', compact ? 'aspect-[4/3]' : 'aspect-square')}>
        {rank != null && (
          <>
            <span className="absolute left-2 top-2 z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#111827]/45 px-2 text-xs font-black text-white backdrop-blur">
              {rank}
            </span>
            <span className="absolute right-2 top-2 z-10 h-5 w-5 rounded-md bg-white/95 ring-1 ring-[#dbe2ea]" />
          </>
        )}
        {offer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#9ca3af]">
            <ExternalLink size={24} />
          </div>
        )}
      </div>

      <div className={cn('space-y-2', compact ? 'p-2.5' : 'p-4')}>
        <div className="flex flex-wrap gap-1.5">
          {offer.matchScore != null && (
            <span className={cn(
              'rounded-full bg-[#f5f3ff] font-black text-[#5b50d6]',
              compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]',
            )}>
              매칭 {formatNumber(offer.matchScore)}점
            </span>
          )}
          <span className={cn(
            'rounded-full bg-[#f8fafc] font-black text-[#4b5563] ring-1 ring-[#eef1f5]',
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]',
          )}>
            {offer.priceCny == null ? '단가 미확인' : `¥${offer.priceCny.toFixed(1)}`}
          </span>
        </div>

        <h4 className={cn(
          'line-clamp-2 font-black text-[#111827]',
          compact ? 'min-h-8 text-xs leading-4' : 'min-h-12 text-base leading-6',
        )}>{offer.title}</h4>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div>
            <p className={cn('font-black text-[#ef4444]', compact ? 'text-xl leading-6' : 'text-3xl leading-9')}>
              {priceKrw == null ? '-' : `₩${formatKRW(priceKrw)}`}
            </p>
            <p className={cn('font-bold text-[#747b96]', compact ? 'text-[11px]' : 'text-sm')}>
              {offer.priceCny == null ? '' : `(¥${offer.priceCny.toFixed(2)})`}
            </p>
          </div>
          {salesLabel && (
            <div className="min-w-0 text-right text-[11px] font-bold leading-4 text-[#747b96]">
              <span className="block">지난 1년간의 판매량:</span>
              <span className="block font-black">{salesLabel}</span>
            </div>
          )}
        </div>

        {primaryTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {primaryTags.slice(0, catalog ? 3 : 2).map((tag) => (
              <span key={tag} className="rounded-md border border-[#dbe2ea] bg-white px-1.5 py-1 text-[10px] font-black text-[#4b5563]">
                {tag}
              </span>
            ))}
          </div>
        )}

        {(offer.shippingFulfillmentRate || offer.shippingPickupRate || offer.shipFrom) && (
          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold leading-4 text-[#747b96]">
            <MiniInfo label="배송 이행률" value={offer.shippingFulfillmentRate ?? '-'} />
            <MiniInfo label="48시간 이내" value={offer.shippingPickupRate ?? '-'} />
            <MiniInfo label="발송지" value={offer.shipFrom ?? '-'} />
          </div>
        )}

        <div className={cn(
          'grid gap-1 font-bold text-[#7a8494]',
          compact ? 'text-[10px] leading-[14px]' : 'text-[11px] leading-4',
        )}>
          <span>입고원가 {offer.landedCostKrw == null ? '-' : `${formatKRW(offer.landedCostKrw)}원`}</span>
          {offer.monthlySales != null && <span>월판매 {formatNumber(offer.monthlySales)}</span>}
        </div>

        {offer.supplierName && (
          <div className="rounded-lg bg-[#f8fafc] p-2 ring-1 ring-[#eef1f5]">
            <p className="truncate text-xs font-black text-[#111827]">{offer.supplierName}</p>
            <p className={cn('mt-1 text-[11px] font-black', sourceFactory ? 'text-[#16a34a]' : 'text-[#8a94a6]')}>
              {sourceFactory ? '원천 공장' : (offer.supplierTags?.[0] ?? '공급사')}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block truncate">{label}</span>
      <span className="block truncate font-black text-[#111827]">{value}</span>
    </div>
  );
}

function OfferListModal({
  title,
  offers,
  searchUrl,
  onClose,
  onSelect,
}: {
  title: string;
  offers: WholesaleOfferGridItem[];
  searchUrl?: string;
  onClose: () => void;
  onSelect: (offer: WholesaleOfferGridItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <p className="text-xs font-black text-[#6d5dfc]">1688 이미지 매칭 후보</p>
            <h3 className="mt-1 line-clamp-1 text-lg font-black text-[#111827]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#667085] transition hover:bg-[#f3f4f6] hover:text-[#111827]"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto bg-[#f8fafc] p-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                density="catalog"
                rank={index + 1}
                onSelect={() => onSelect(offer)}
              />
            ))}
          </div>
        </div>
        {searchUrl && (
          <div className="border-t border-[#eef1f5] bg-white px-5 py-3">
            <a
              href={searchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-white px-3 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed]"
            >
              <ExternalLink size={14} />
              1688 키워드 검색 열기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function OfferOrderModal({
  offer,
  searchUrl,
  onClose,
}: {
  offer: WholesaleOfferGridItem;
  searchUrl?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between border-b border-[#eef1f5] px-5 py-4">
          <div>
            <p className="text-xs font-black text-[#6d5dfc]">1688 주문 확인</p>
            <h3 className="mt-1 text-lg font-black text-[#111827]">후보 상품 상세</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#667085] transition hover:bg-[#f3f4f6] hover:text-[#111827]"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
          <div className="aspect-square overflow-hidden rounded-xl bg-[#eef1f5]">
            {offer.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="min-w-0">
            <h4 className="line-clamp-3 text-base font-black leading-6 text-[#111827]">{offer.title}</h4>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ModalMetric label="1688 단가" value={offer.priceCny == null ? '-' : `¥${offer.priceCny.toFixed(1)}`} />
              <ModalMetric label="입고원가" value={offer.landedCostKrw == null ? '-' : `${formatKRW(offer.landedCostKrw)}원`} />
              <ModalMetric label="예상 이익" value={offer.estimatedProfitKrw == null ? '-' : `${formatKRW(offer.estimatedProfitKrw)}원`} />
              <ModalMetric label="예상 마진" value={offer.estimatedMarginRate == null ? '-' : `${offer.estimatedMarginRate}%`} />
            </div>

            <div className="mt-4 rounded-xl border border-[#eef1f5] bg-[#fbfcfe] p-4">
              <label className="text-xs font-black text-[#667085]" htmlFor="wholesale-order-quantity">주문 수량</label>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <input
                  id="wholesale-order-quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className="h-10 rounded-lg border border-[#dbe2ea] bg-white px-3 text-sm font-bold text-[#111827] outline-none focus:border-[#6d5dfc] focus:ring-2 focus:ring-[#6d5dfc]/10"
                />
                <span className="inline-flex h-10 items-center rounded-lg bg-white px-3 text-xs font-black text-[#667085] ring-1 ring-[#eef1f5]">개</span>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-[#8a94a6]">
                실제 주문과 옵션 선택은 1688 상품 페이지에서 최종 확인하세요.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={offer.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2f80ed] px-4 text-xs font-black text-white transition hover:bg-[#256bd1]"
              >
                <ShoppingCart size={15} />
                1688에서 주문하기
              </a>
              {searchUrl && (
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dbe2ea] bg-white px-4 text-xs font-black text-[#4b5563] transition hover:border-[#2f80ed] hover:text-[#2f80ed]"
                >
                  <ExternalLink size={15} />
                  키워드 검색 열기
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('rounded-lg bg-[#f8fafc] px-3 py-2 ring-1 ring-[#eef1f5]', label === '입고원가' && 'bg-[#fff4ee] ring-[#ffd6c6]')}>
      <p className="text-[10px] font-bold text-[#9ca3af]">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-[#111827]">{value}</p>
    </div>
  );
}
