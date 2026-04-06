'use client';

import { Heart, ShoppingCart, Star } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

interface MobilePreviewProps {
  name: string;
  mainImage: string;
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  rating: number;
  reviewCount: number;
}

export default function MobilePreview({
  name,
  mainImage,
  salePrice,
  originalPrice,
  discountRate,
  rating,
  reviewCount,
}: MobilePreviewProps) {
  return (
    <div className="sticky top-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        미리보기
      </p>

      <div className="mx-auto w-[280px] rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 shadow-xl shadow-slate-300/50 overflow-hidden">
        <div className="relative bg-slate-800 flex justify-center py-2">
          <div className="w-20 h-5 bg-slate-900 rounded-full" />
        </div>

        <div className="bg-white h-[500px] overflow-y-auto">
          <div className="bg-emerald-500 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-white/20 rounded" />
              <span className="text-white text-xs font-bold tracking-tight">
                스마트스토어
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-white/20 rounded-full" />
              <div className="w-4 h-4 bg-white/20 rounded-full" />
            </div>
          </div>

          <div className="aspect-square bg-slate-100">
            <img
              src={mainImage}
              alt="상품 미리보기"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-3 space-y-2.5">
            <p className="text-[10px] text-slate-400">해피프렌즈 공식스토어</p>
            <p className="text-xs font-medium text-slate-800 leading-relaxed line-clamp-2">
              {name}
            </p>

            <div className="flex items-center gap-1">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              <span className="text-[11px] font-bold text-slate-800">
                {rating}
              </span>
              <span className="text-[10px] text-slate-400">
                리뷰 {formatKRW(reviewCount)}개
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-extrabold text-red-500">
                  {discountRate}%
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  {formatKRW(salePrice)}원
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-through">
                {formatKRW(originalPrice)}원
              </p>
            </div>

            <div className="flex items-center gap-1 pt-1">
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded">
                무료배송
              </span>
              <span className="text-[10px] text-slate-500">
                내일(수) 도착 예정
              </span>
            </div>

            <div className="border-t border-slate-100 pt-2 mt-2">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded">
                  최대적립
                </span>
                <span className="text-[10px] text-slate-600">
                  {formatKRW(Math.floor(salePrice * 0.01))}P 적립
                </span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
            <button className="p-2 border border-slate-200 rounded-lg">
              <Heart size={16} className="text-slate-400" />
            </button>
            <button className="flex-1 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5">
              <ShoppingCart size={13} />
              바로구매
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-400 mt-3">
        실제 표시와 다를 수 있습니다
      </p>
    </div>
  );
}
