'use client';

// 쿠팡 모바일 PDP 미리보기 — 3가지 탭 (PDP / 검색결과 카드 / 장바구니 카드).
// 오른쪽 패널에서 상품 정보와 상세페이지가 한 장의 긴 미리보기로 이어지게 보여준다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, ShoppingCart, Star, Search, Layers, Smartphone, X } from 'lucide-react';
import { formatKRW, cn } from '@/lib/utils';
import {
  isDetailPreviewMetricsMessage,
  SCRIPTED_PREVIEW_SANDBOX,
  withDetailPreviewBridge,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/preview-sandbox';

type PreviewMode = 'pdp' | 'search' | 'list';

interface MobilePreviewProps {
  name: string;
  mainImage: string;
  previewImages?: string[];
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  rating: number;
  reviewCount: number;
  detailHtml?: string | null;
  sticky?: boolean;
  className?: string;
}

const TABS: { key: PreviewMode; label: string; Icon: typeof Smartphone }[] = [
  { key: 'pdp', label: '상세', Icon: Smartphone },
  { key: 'search', label: '검색', Icon: Search },
  { key: 'list', label: '목록', Icon: Layers },
];
const DETAIL_DOCUMENT_WIDTH = 720;
const MOBILE_DETAIL_VIEWPORT_WIDTH = 400;
const MOBILE_DETAIL_SCALE = MOBILE_DETAIL_VIEWPORT_WIDTH / DETAIL_DOCUMENT_WIDTH;

export default function MobilePreview({
  name,
  mainImage,
  previewImages = [],
  salePrice,
  originalPrice,
  discountRate,
  rating,
  reviewCount,
  detailHtml = null,
  sticky = false,
  className,
}: MobilePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('pdp');
  const [imageIndex, setImageIndex] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const previewGallery = useMemo(
    () => uniqueImages([mainImage, ...(previewImages ?? [])]),
    [mainImage, previewImages],
  );
  const activeImage = previewGallery[imageIndex] ?? mainImage;
  const hasImageNav = previewGallery.length > 1;
  const goPreviousImage = () => {
    setImageIndex((current) => (current - 1 + previewGallery.length) % previewGallery.length);
  };
  const goNextImage = () => {
    setImageIndex((current) => (current + 1) % previewGallery.length);
  };

  useEffect(() => {
    setImageIndex(0);
  }, [previewGallery.join('|')]);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomedImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedImage]);

  return (
    <div
      data-testid="mobile-preview-root"
      className={cn(
        'flex h-full max-h-[calc(100vh-2.5rem)] min-h-0 flex-col',
        sticky ? 'sticky top-6' : '',
        className,
      )}
    >
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        미리보기 — 쿠팡
      </p>

      {/* 탭 — 어떤 쿠팡 화면 미리볼지 */}
      <div className="mx-auto mb-3 flex w-full max-w-[420px] gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = mode === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition-all',
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon size={11} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        data-testid="mobile-preview-page"
        className="mx-auto flex min-h-0 w-full max-w-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {mode === 'pdp' && (
          <PdpView
            name={name}
            mainImage={activeImage}
            imageIndex={imageIndex}
            imageCount={previewGallery.length}
            hasImageNav={hasImageNav}
            onPreviousImage={goPreviousImage}
            onNextImage={goNextImage}
            onZoomImage={setZoomedImage}
            salePrice={salePrice}
            originalPrice={originalPrice}
            discountRate={discountRate}
            rating={rating}
            reviewCount={reviewCount}
            detailHtml={detailHtml}
          />
        )}
        {mode === 'search' && (
          <SearchView name={name} mainImage={activeImage} salePrice={salePrice} discountRate={discountRate} rating={rating} reviewCount={reviewCount} onZoomImage={setZoomedImage} />
        )}
        {mode === 'list' && (
          <ListView name={name} mainImage={activeImage} salePrice={salePrice} originalPrice={originalPrice} discountRate={discountRate} rating={rating} reviewCount={reviewCount} onZoomImage={setZoomedImage} />
        )}
      </div>

      {zoomedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="상품 이미지 확대 보기"
          data-testid="mobile-preview-image-zoom"
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setZoomedImage(null);
            }}
            className="absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
          <img
            src={zoomedImage}
            alt="상품 이미지 확대"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        </div>
      ) : null}
    </div>
  );
}

function uniqueImages(images: string[]): string[] {
  return Array.from(new Set(images.map((image) => image.trim()).filter(Boolean)));
}

/* ============================================================================
   PDP — 상세페이지 미리보기 (full-bleed product shot + 가격 + WOW + CTA)
============================================================================ */

function PdpView({
  name,
  mainImage,
  imageIndex = 0,
  imageCount = 1,
  hasImageNav = false,
  onPreviousImage,
  onNextImage,
  onZoomImage,
  salePrice,
  originalPrice,
  discountRate,
  rating,
  reviewCount,
  detailHtml = null,
}: MobilePreviewProps & {
  imageIndex?: number;
  imageCount?: number;
  hasImageNav?: boolean;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
  onZoomImage?: (url: string) => void;
}) {
  const detailIframeRef = useRef<HTMLIFrameElement>(null);
  const [detailDocumentHeight, setDetailDocumentHeight] = useState(480);
  const [zoomedDetail, setZoomedDetail] = useState(false);
  const sandboxedDetailHtml = useMemo(
    () => (detailHtml ? withDetailPreviewBridge(detailHtml) : null),
    [detailHtml],
  );

  useEffect(() => {
    if (!sandboxedDetailHtml) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== detailIframeRef.current?.contentWindow) return;
      if (!isDetailPreviewMetricsMessage(event.data)) return;
      setDetailDocumentHeight(Math.min(16_000, Math.max(120, Math.ceil(event.data.scrollHeight))));
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [sandboxedDetailHtml]);

  useEffect(() => {
    setDetailDocumentHeight(480);
  }, [sandboxedDetailHtml]);

  useEffect(() => {
    if (!zoomedDetail) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomedDetail(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedDetail]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="mobile-preview-scroll-content"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-2 py-2 flex items-center gap-1.5">
        <button type="button" className="p-1 text-slate-700" aria-label="뒤로">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
          <Search size={11} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 truncate">쿠팡에서 검색</span>
        </div>
        <button type="button" className="p-1 text-slate-700" aria-label="찜">
          <Heart size={14} />
        </button>
        <button type="button" className="relative p-1 text-slate-700" aria-label="장바구니">
          <ShoppingCart size={14} />
          <span
            className="absolute -top-0 -right-0 inline-flex h-3 min-w-[12px] items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white"
            style={{ background: '#CB1D2A' }}
          >
            0
          </span>
        </button>
      </div>

      <div className="relative aspect-square bg-slate-100">
        <button
          type="button"
          onClick={() => onZoomImage?.(mainImage)}
          aria-label="상품 이미지 확대 보기"
          className="absolute inset-0 cursor-zoom-in"
        >
          <img
            src={mainImage}
            alt="상품"
            className="h-full w-full object-cover"
            draggable={false}
          />
        </button>
        {hasImageNav && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPreviousImage?.();
              }}
              className="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow ring-1 ring-slate-200"
              aria-label="이전 썸네일 이미지"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNextImage?.();
              }}
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow ring-1 ring-slate-200"
              aria-label="다음 썸네일 이미지"
            >
              <ChevronRight size={18} />
            </button>
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white">
              {imageIndex + 1} / {imageCount}
            </span>
          </>
        )}
      </div>

      <div className="bg-white px-3 pt-3 pb-2.5 space-y-1.5">
        <p className="text-[10px] text-slate-400">브랜드 &gt;</p>
        <p className="text-[13px] font-medium text-slate-900 leading-snug">{name}</p>
        <div className="flex items-center gap-1">
          <Star size={11} className="fill-amber-400 text-amber-400" />
          <span className="text-[11px] font-bold text-slate-800">{rating}</span>
          <span className="text-[10px] text-slate-400 underline">
            리뷰 {formatKRW(reviewCount)}개 &gt;
          </span>
        </div>
      </div>

      <div className="bg-white border-t border-slate-100 px-3 py-3 space-y-1">
        <span
          className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold"
          style={{ background: '#FFE9EB', color: '#CB1D2A' }}
        >
          와우할인가
        </span>
        <p className="pt-1 text-[10px] text-slate-400 line-through">{formatKRW(originalPrice)}원</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold" style={{ color: '#CB1D2A' }}>
            {discountRate}%
          </span>
          <span className="text-xl font-extrabold text-slate-900">{formatKRW(salePrice)}원</span>
        </div>
        <div className="flex items-center gap-1.5 pt-1.5">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white"
            style={{ background: '#1E61D5' }}
          >
            <span>🚀</span>로켓배송
          </span>
          <span className="text-[10px] text-slate-700">
            <span className="font-bold">내일(수)</span> 도착 보장
          </span>
        </div>
      </div>

      <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white"
          style={{ background: '#9333EA' }}
        >
          WOW
        </span>
        <span className="text-[10px] text-slate-700">
          최대 {formatKRW(Math.floor(salePrice * 0.05))}원 캐시 적립
        </span>
      </div>

      <button
        type="button"
        className="w-full bg-white border-t border-slate-100 px-3 py-2.5 flex items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold text-slate-800">쿠폰 할인 받기</span>
        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
          쿠폰 받기
          <ChevronRight size={11} />
        </span>
      </button>

      <button
        type="button"
        className="w-full bg-white border-t border-slate-100 px-3 py-2.5 flex items-center justify-between text-left"
      >
        <span className="text-[11px] text-slate-800">옵션 선택</span>
        <ChevronRight size={12} className="text-slate-400" />
      </button>

      <div className="bg-slate-50 border-t border-slate-100 px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">도착 보장</span>
          <span className="text-[10px] font-bold text-slate-800">내일(수) 도착</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">무료반품</span>
          <span className="text-[10px] text-slate-800">30일 이내 가능</span>
        </div>
      </div>

      {sandboxedDetailHtml ? (
        <div className="border-t border-slate-100 bg-slate-50 px-2 py-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-slate-500">상세페이지</p>
            <span className="text-[9px] text-slate-400">탭하여 크게 보기</span>
          </div>
          <div
            data-testid="mobile-preview-detail-scroll-region"
            className="relative block w-full overflow-hidden rounded-md border border-slate-200 bg-white"
            style={{ height: Math.ceil(detailDocumentHeight * MOBILE_DETAIL_SCALE) }}
          >
            <iframe
              ref={detailIframeRef}
              title="mobile-registration-detail-preview"
              srcDoc={sandboxedDetailHtml}
              className="pointer-events-none border-0"
              sandbox={SCRIPTED_PREVIEW_SANDBOX}
              scrolling="no"
              style={{
                width: DETAIL_DOCUMENT_WIDTH,
                height: detailDocumentHeight,
                transform: `scale(${MOBILE_DETAIL_SCALE})`,
                transformOrigin: 'top left',
              }}
            />
            <button
              type="button"
              onClick={() => setZoomedDetail(true)}
              aria-label="상세페이지 크게 보기"
              className="absolute inset-0 cursor-zoom-in bg-transparent"
            />
          </div>
        </div>
      ) : null}
      </div>

      <div
        data-testid="mobile-preview-fixed-actions"
        className="shrink-0 border-t border-slate-200 bg-white px-2 py-2 flex items-stretch gap-1.5"
      >
        <button
          type="button"
          className="flex w-10 flex-col items-center justify-center rounded-lg text-slate-500"
          aria-label="찜"
        >
          <Heart size={16} className="text-slate-400" />
          <span className="mt-0.5 text-[9px] text-slate-500">찜</span>
        </button>
        <button
          type="button"
          className="flex-1 text-xs font-bold rounded-lg flex items-center justify-center"
          style={{ background: '#FFE9EB', color: '#CB1D2A' }}
        >
          장바구니
        </button>
        <button
          type="button"
          className="flex-1 text-white text-xs font-bold rounded-lg flex items-center justify-center"
          style={{ background: '#CB1D2A' }}
        >
          바로구매
        </button>
      </div>

      {zoomedDetail && sandboxedDetailHtml ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="상세페이지 크게 보기"
          data-testid="mobile-preview-detail-zoom"
          onClick={() => setZoomedDetail(false)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setZoomedDetail(false);
            }}
            className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
          <div
            onClick={(event) => event.stopPropagation()}
            className="h-[92vh] w-[720px] max-w-[92vw] cursor-default overflow-y-auto rounded-xl bg-white shadow-2xl"
          >
            <iframe
              title="mobile-registration-detail-preview-zoom"
              srcDoc={sandboxedDetailHtml}
              sandbox={SCRIPTED_PREVIEW_SANDBOX}
              scrolling="no"
              className="block border-0"
              style={{ width: DETAIL_DOCUMENT_WIDTH, height: detailDocumentHeight, maxWidth: '100%' }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   Search — 검색결과 카드 (square thumb + 카피 + 가격 + 별점)
============================================================================ */

function SearchView({
  name, mainImage, salePrice, discountRate, rating, reviewCount, onZoomImage,
}: Omit<MobilePreviewProps, 'originalPrice'> & { onZoomImage?: (url: string) => void }) {
  return (
    <>
      {/* 검색바 */}
      <div className="bg-white border-b border-slate-100 px-3 py-2 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
          <Search size={11} className="text-slate-400" />
          <span className="text-[11px] text-slate-500 truncate">{name.slice(0, 14) || '키워드'}</span>
        </div>
      </div>

      {/* 결과 카운트 + 필터 */}
      <div className="px-3 py-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>약 1,234개 상품</span>
        <span>랭킹순 ▾</span>
      </div>

      {/* 카드 (= 사용자 상품) */}
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => onZoomImage?.(mainImage)}
            aria-label="상품 이미지 확대 보기"
            className="block aspect-square w-full cursor-zoom-in bg-slate-100"
          >
            <img src={mainImage} alt="상품" className="h-full w-full object-cover" draggable={false} />
          </button>
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center gap-1">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white"
                style={{ background: '#1E61D5' }}
              >
                <span>🚀</span>로켓배송
              </span>
            </div>
            <p className="text-[11px] text-slate-800 leading-relaxed line-clamp-2">{name}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-extrabold" style={{ color: '#CB1D2A' }}>
                {discountRate}%
              </span>
              <span className="text-sm font-extrabold text-slate-900">{formatKRW(salePrice)}원</span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <Star size={10} className="fill-amber-400 text-amber-400" />
              <span className="font-bold text-slate-700">{rating}</span>
              <span className="text-slate-400">({formatKRW(reviewCount)})</span>
            </div>
            <span className="text-[9px] text-slate-500">내일(수) 도착 보장</span>
          </div>
        </div>

        {/* 다른 카드 placeholder — 검색 컨텍스트 강조 */}
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex gap-2">
            <div className="w-16 h-16 bg-slate-100 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-2.5 w-3/4 bg-slate-100 rounded" />
              <div className="h-2.5 w-1/2 bg-slate-100 rounded" />
              <div className="h-3 w-1/3 bg-slate-200 rounded mt-1" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   List — 카테고리/홈 랭킹 리스트 (가로 행 카드, 작은 썸네일)
============================================================================ */

function ListView({
  name, mainImage, salePrice, originalPrice, discountRate, rating, reviewCount, onZoomImage,
}: MobilePreviewProps & { onZoomImage?: (url: string) => void }) {
  return (
    <>
      <div className="bg-white border-b border-slate-100 px-3 py-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">베스트</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* 사용자 상품 — 1위 강조 */}
        <div className="flex gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 relative">
          <span
            className="absolute -top-1.5 -left-1.5 rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white shadow"
            style={{ background: '#CB1D2A' }}
          >
            1위
          </span>
          <button
            type="button"
            onClick={() => onZoomImage?.(mainImage)}
            aria-label="상품 이미지 확대 보기"
            className="h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded bg-slate-100"
          >
            <img src={mainImage} alt="상품" className="h-full w-full object-cover" draggable={false} />
          </button>
          <div className="flex-1 min-w-0 space-y-1">
            <span
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[8px] font-extrabold text-white"
              style={{ background: '#1E61D5' }}
            >
              🚀 로켓
            </span>
            <p className="text-[11px] text-slate-800 leading-tight line-clamp-2">{name}</p>
            <div className="flex items-center gap-0.5">
              <Star size={9} className="fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-700">{rating}</span>
              <span className="text-[9px] text-slate-400">({formatKRW(reviewCount)})</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-extrabold" style={{ color: '#CB1D2A' }}>
                {discountRate}%
              </span>
              <span className="text-xs font-extrabold text-slate-900">{formatKRW(salePrice)}원</span>
            </div>
            {originalPrice > salePrice && (
              <span className="text-[9px] text-slate-400 line-through">{formatKRW(originalPrice)}원</span>
            )}
          </div>
        </div>

        {/* 2 ~ 4위 placeholder */}
        {[2, 3, 4].map((i) => (
          <div key={i} className="flex gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="w-20 h-20 shrink-0 bg-slate-100 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-2 w-1/3 bg-slate-100 rounded" />
              <div className="h-2.5 w-full bg-slate-100 rounded" />
              <div className="h-2.5 w-2/3 bg-slate-100 rounded" />
              <div className="h-3 w-1/2 bg-slate-200 rounded mt-1" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
