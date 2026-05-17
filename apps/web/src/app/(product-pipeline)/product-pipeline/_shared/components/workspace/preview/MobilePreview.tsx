'use client';

// 쿠팡 모바일 PDP 미리보기 — 3가지 탭 (PDP / 검색결과 카드 / 장바구니 카드).
// 사용자 요구: thumbnail-editor 에서 이미 쓰는 CoupangSearchCardPreview/CoupangDetailPreview 와
// 동일한 패턴 (탭으로 미리보기 변경) + iPhone 17 모양 프레임.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, ShoppingCart, Star, Search, Layers, Smartphone } from 'lucide-react';
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
const MOBILE_DETAIL_VIEWPORT_WIDTH = 304;
const MOBILE_DETAIL_SCALE = MOBILE_DETAIL_VIEWPORT_WIDTH / DETAIL_DOCUMENT_WIDTH;

export default function MobilePreview({
  name,
  mainImage,
  salePrice,
  originalPrice,
  discountRate,
  rating,
  reviewCount,
  detailHtml = null,
  sticky = true,
  className,
}: MobilePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('pdp');

  return (
    <div className={cn(sticky ? 'sticky top-6' : '', className)}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        미리보기 — 쿠팡
      </p>

      {/* 탭 — 어떤 쿠팡 화면 미리볼지 */}
      <div className="mx-auto mb-3 flex w-[320px] gap-1 rounded-lg bg-slate-100 p-1">
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

      {/* iPhone 17 스타일 프레임 — 두꺼운 검은 베젤 + Dynamic Island (가운데 pill).
          rounded-[2.75rem] 외곽 + rounded-[2.25rem] inner = squircle + iOS curved bezel 톤. */}
      <div className="mx-auto w-[320px] rounded-[2.75rem] border-[8px] border-slate-900 bg-slate-900 shadow-xl shadow-slate-300/60 overflow-hidden relative">
        {/* Dynamic Island — 화면 영역 위에 floating pill 로 떠있음 */}
        <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[88px] -translate-x-1/2 rounded-full bg-black" />

        <div
          data-testid="mobile-preview-phone-scroll"
          className="bg-white h-[640px] overflow-y-auto rounded-[2.25rem]"
        >
          {/* 상단 status bar 영역 — Dynamic Island 가 가리는 만큼 padding */}
          <div className="h-9" />

          {mode === 'pdp' && (
            <PdpView
              name={name}
              mainImage={mainImage}
              salePrice={salePrice}
              originalPrice={originalPrice}
              discountRate={discountRate}
              rating={rating}
              reviewCount={reviewCount}
              detailHtml={detailHtml}
            />
          )}
          {mode === 'search' && (
            <SearchView name={name} mainImage={mainImage} salePrice={salePrice} discountRate={discountRate} rating={rating} reviewCount={reviewCount} />
          )}
          {mode === 'list' && (
            <ListView name={name} mainImage={mainImage} salePrice={salePrice} originalPrice={originalPrice} discountRate={discountRate} rating={rating} reviewCount={reviewCount} />
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-400 mt-3">
        쿠팡 모바일 미리보기 — 실제 표시와 다를 수 있습니다
      </p>
    </div>
  );
}

/* ============================================================================
   PDP — 상세페이지 미리보기 (full-bleed product shot + 가격 + WOW + CTA)
============================================================================ */

function PdpView({
  name,
  mainImage,
  salePrice,
  originalPrice,
  discountRate,
  rating,
  reviewCount,
  detailHtml = null,
}: MobilePreviewProps) {
  const detailIframeRef = useRef<HTMLIFrameElement>(null);
  const [detailDocumentHeight, setDetailDocumentHeight] = useState(960);
  const sandboxedDetailHtml = useMemo(
    () => (detailHtml ? withDetailPreviewBridge(detailHtml) : null),
    [detailHtml],
  );

  useEffect(() => {
    if (!sandboxedDetailHtml) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== detailIframeRef.current?.contentWindow) return;
      if (!isDetailPreviewMetricsMessage(event.data)) return;
      setDetailDocumentHeight(Math.min(16_000, Math.max(720, Math.ceil(event.data.scrollHeight))));
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [sandboxedDetailHtml]);

  useEffect(() => {
    setDetailDocumentHeight(960);
  }, [sandboxedDetailHtml]);

  return (
    <>
      <div className="bg-white border-b border-slate-100 px-3 py-2.5 flex items-center justify-between">
        <span className="text-base font-extrabold tracking-tight" style={{ color: '#CB1D2A' }}>
          coupang
        </span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-slate-200" />
          <div className="w-4 h-4 rounded-full bg-slate-200" />
        </div>
      </div>

      <div className="aspect-square bg-slate-100">
        <img src={mainImage} alt="상품" className="w-full h-full object-cover" />
      </div>

      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white"
            style={{ background: '#1E61D5' }}
          >
            <span>🚀</span>로켓배송
          </span>
          <span className="text-[10px] text-slate-500">내일(수) 도착 보장</span>
        </div>

        <p className="text-xs font-medium text-slate-800 leading-relaxed line-clamp-2">{name}</p>

        <div className="flex items-center gap-1">
          <Star size={11} className="fill-amber-400 text-amber-400" />
          <span className="text-[11px] font-bold text-slate-800">{rating}</span>
          <span className="text-[10px] text-slate-400">리뷰 {formatKRW(reviewCount)}개</span>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold" style={{ color: '#CB1D2A' }}>
              {discountRate}%
            </span>
            <span className="text-lg font-extrabold text-slate-900">{formatKRW(salePrice)}원</span>
          </div>
          <p className="text-[11px] text-slate-400 line-through">{formatKRW(originalPrice)}원</p>
        </div>

        <div className="border-t border-slate-100 pt-2 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white" style={{ background: '#9333EA' }}>
              WOW
            </span>
            <span className="text-[10px] text-slate-700">
              최대 {formatKRW(Math.floor(salePrice * 0.05))}원 캐시 적립
            </span>
          </div>
        </div>
      </div>

      {sandboxedDetailHtml ? (
        <div className="border-t border-slate-100 bg-slate-50 px-2 py-3">
          <p className="mb-2 text-[10px] font-bold text-slate-500">상세페이지</p>
          <div
            data-testid="mobile-preview-detail-scroll-region"
            className="overflow-hidden rounded-md border border-slate-200 bg-white"
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
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
        <button className="p-2 border border-slate-200 rounded-lg">
          <Heart size={16} className="text-slate-400" />
        </button>
        <button
          className="flex-1 py-2.5 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
          style={{ background: '#CB1D2A' }}
        >
          <ShoppingCart size={13} />
          바로구매
        </button>
      </div>
    </>
  );
}

/* ============================================================================
   Search — 검색결과 카드 (square thumb + 카피 + 가격 + 별점)
============================================================================ */

function SearchView({
  name, mainImage, salePrice, discountRate, rating, reviewCount,
}: Omit<MobilePreviewProps, 'originalPrice'>) {
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
          <div className="aspect-square bg-slate-100">
            <img src={mainImage} alt="상품" className="w-full h-full object-cover" />
          </div>
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
  name, mainImage, salePrice, originalPrice, discountRate, rating, reviewCount,
}: MobilePreviewProps) {
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
          <div className="w-20 h-20 shrink-0 bg-slate-100 rounded overflow-hidden">
            <img src={mainImage} alt="상품" className="w-full h-full object-cover" />
          </div>
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
