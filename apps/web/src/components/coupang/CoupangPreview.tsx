'use client';
import { Star, Truck, Heart, ShoppingCart } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface Props {
  imageUrl: string;
  productName: string;
}

// 실제 쿠팡 노출 포맷을 흉내낸 mock 미리보기.
// 가격·리뷰·별점은 플레이스홀더 — 썸네일이 쿠팡 UI 안에서 어떻게 읽히는지 시각적으로만 확인.
const MOCK_PRICE = 29900;
const MOCK_ORIGINAL_PRICE = 39900;
const MOCK_DISCOUNT_PCT = 25;
const MOCK_RATING = 4.5;
const MOCK_REVIEW_COUNT = 3247;

export function CoupangSearchCardPreview({ imageUrl, productName }: Props) {
  const displayName = productName || '상품명';
  return (
    <div className="w-full max-w-[480px] bg-white rounded-xl overflow-hidden border border-gray-200 shadow-md">
      <div className="relative aspect-square bg-gray-50">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        )}
        <button
          type="button"
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-gray-500 hover:text-rose-500"
          aria-label="찜"
        >
          <Heart size={18} />
        </button>
      </div>
      <div className="p-5 space-y-2.5">
        <p className="text-[16px] text-gray-900 leading-snug line-clamp-2">{displayName}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-gray-400 line-through">
            {formatNumber(MOCK_ORIGINAL_PRICE)}원
          </span>
          <span className="text-[14px] font-bold text-rose-600">{MOCK_DISCOUNT_PCT}%</span>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-[26px] font-extrabold text-gray-900 tracking-tight">
            {formatNumber(MOCK_PRICE)}
          </span>
          <span className="text-[16px] font-bold text-gray-900">원</span>
        </div>
        <div className="flex items-center gap-1 pt-0.5">
          <Star size={14} className="fill-amber-400 text-amber-400" />
          <span className="text-[13px] font-bold text-gray-800">{MOCK_RATING}</span>
          <span className="text-[13px] text-gray-400">({formatNumber(MOCK_REVIEW_COUNT)})</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-[#1e88f0] text-white text-[12px] font-black tracking-tight">
            <Truck size={11} />
            로켓배송
          </span>
          <span className="text-[12px] text-gray-500">내일(수) 도착 보장</span>
        </div>
      </div>
    </div>
  );
}

export function CoupangDetailPreview({ imageUrl, productName }: Props) {
  const displayName = productName || '상품명';
  return (
    <div className="w-full max-w-[1080px] bg-white rounded-xl overflow-hidden border border-gray-200 shadow-md">
      <div className="grid grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-square bg-gray-50 border-r border-gray-100">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={displayName}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              draggable={false}
            />
          )}
        </div>
        <div className="p-6 flex flex-col gap-3">
          <div>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#1e88f0] text-white text-[10px] font-black tracking-tight">
              <Truck size={10} />
              로켓배송
            </span>
          </div>
          <h1 className="text-[16px] font-bold text-gray-900 leading-snug line-clamp-3">
            {displayName}
          </h1>
          <div className="flex items-center gap-1">
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <Star size={13} className="fill-amber-200 text-amber-200" />
            <span className="text-[12px] font-bold text-gray-800 ml-1">{MOCK_RATING}</span>
            <span className="text-[12px] text-gray-500">상품평 {formatNumber(MOCK_REVIEW_COUNT)}개</span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] text-gray-400 line-through">
                {formatNumber(MOCK_ORIGINAL_PRICE)}원
              </span>
            </div>
            <div className="flex items-baseline gap-1 pt-0.5">
              <span className="text-[14px] font-bold text-rose-600">{MOCK_DISCOUNT_PCT}%</span>
              <span className="text-[24px] font-extrabold text-gray-900 tracking-tight">
                {formatNumber(MOCK_PRICE)}
              </span>
              <span className="text-[14px] font-bold text-gray-900">원</span>
            </div>
            <p className="text-[11px] text-gray-500 pt-0.5">
              와우할인가 · 쿠폰 적용 시 {formatNumber(MOCK_PRICE - 1000)}원
            </p>
          </div>
          <div className="mt-auto flex gap-2 pt-2">
            <button
              type="button"
              className="flex-1 py-3 rounded-md text-[13px] font-bold text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <ShoppingCart size={14} />
              장바구니
            </button>
            <button
              type="button"
              className="flex-1 py-3 rounded-md text-[13px] font-extrabold text-white bg-[#e94d4d] hover:bg-[#d84040] transition-colors"
            >
              바로구매
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
