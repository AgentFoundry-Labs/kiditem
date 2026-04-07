'use client';

import { useRouter } from 'next/navigation';
import type { ProductListItem as Product } from '@kiditem/shared';
import { formatKRW, formatPercent, getProfitColor, getProductStatusBadge } from '@/lib/utils';

interface ProductListItemProps {
  product: Product;
  rank: number;
}

export default function ProductListItem({ product: p, rank }: ProductListItemProps) {
  const router = useRouter();
  const badge = getProductStatusBadge(p.status);
  const t = p.traffic;
  const isNew = p.createdAt ? (Date.now() - new Date(p.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000 : false;

  return (
    <div
      onClick={() => router.push(`/products/${p.id}`)}
      className="flex items-center px-5 py-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
    >
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex flex-col items-center w-8">
          <span className="text-sm text-slate-400">#{rank}</span>
          {isNew && (
            <span className="mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-600 rounded">NEW</span>
          )}
        </div>
        <div className="w-[60px] h-[60px] rounded-lg bg-slate-100 overflow-hidden shrink-0">
          {(p.thumbnailUrl || p.imageUrl) ? (
            <img src={p.thumbnailUrl || p.imageUrl!} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 ml-4">
        <p className="text-base font-semibold text-slate-900 truncate">{p.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
          <span className="text-xs text-slate-400">ID: {p.coupangProductId || p.sku}</span>
        </div>
        {p.category && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {p.category.split('/').slice(-2).join('/')}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {p.abcGrade && (
            <>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                p.abcGrade === 'A' ? 'bg-green-100 text-green-700' :
                p.abcGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                'bg-red-100 text-red-700'
              }`}>{p.abcGrade}</span>
              {p.gradeScore != null && (
                <span className="text-xs text-slate-500">{p.gradeScore}점</span>
              )}
            </>
          )}
          {p.healthScore != null && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              p.healthScore >= 70 ? 'bg-green-50 text-green-700' :
              p.healthScore >= 40 ? 'bg-amber-50 text-amber-700' :
              'bg-red-50 text-red-700'
            }`}>{p.healthScore}</span>
          )}
          {p.adTier && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              p.adTier === '1차' ? 'bg-purple-50 text-purple-600' :
              p.adTier === '2차' ? 'bg-purple-50 text-purple-600' :
              'bg-slate-100 text-slate-500'
            }`}>{p.adTier} 광고</span>
          )}
          {p.reviewCount > 0 && (
            <span className="text-[11px] text-slate-500">리뷰 {p.reviewCount.toLocaleString()}건</span>
          )}
          {p.orderCount > 0 && (
            <span className="text-[11px] text-slate-500">주문 {p.orderCount.toLocaleString()}건</span>
          )}
          {p.thumbnailCTR > 0 && (
            <span className="text-[11px] text-slate-500">CTR {p.thumbnailCTR.toFixed(1)}%</span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${
          p.abcGrade === 'A' ? 'text-green-600' :
          p.abcGrade === 'B' ? 'text-amber-600' :
          'text-red-500'
        }`}>
          {p.abcGrade === 'A'
            ? '→ 핵심 상품 — 매출 집중 관리'
            : p.abcGrade === 'B' && p.profitRate >= 0
              ? '→ 성장 가능 — 광고 최적화 추천'
              : p.abcGrade === 'B' && p.profitRate < 0
                ? '→ 수익성 개선 필요 — 원가/광고비 점검'
                : p.abcGrade === 'C' && p.adTier
                  ? '→ 광고 중단 검토 — 매출 대비 광고비 역전'
                  : p.abcGrade === 'C'
                    ? '→ 정리 대상 — 판매 중단 고려'
                    : ''}
        </p>
      </div>

      <div className="flex items-center shrink-0">
        <div className="w-[72px]" />
        <div className="w-[80px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {t?.visitors != null ? t.visitors.toLocaleString() : <span className="text-slate-300">-</span>}
          </p>
          <p className="text-xs text-slate-400">방문자</p>
        </div>
        <div className="w-[72px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {t?.views != null ? t.views.toLocaleString() : <span className="text-slate-300">-</span>}
          </p>
          <p className="text-xs text-slate-400">조회</p>
        </div>
        <div className="w-[80px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {t?.cartAdds != null ? t.cartAdds.toLocaleString() : <span className="text-slate-300">-</span>}
          </p>
          <p className="text-xs text-slate-400">장바구니</p>
        </div>
        <div className="w-[72px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {t?.orders != null ? t.orders.toLocaleString() : <span className="text-slate-300">-</span>}
          </p>
          <p className="text-xs text-slate-400">주문</p>
        </div>
        <div className="w-[88px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {t?.salesQty != null ? t.salesQty.toLocaleString() : <span className="text-slate-300">-</span>}
          </p>
          <p className={`text-xs ${getProfitColor(p.profitRate)}`}>이익률 {formatPercent(p.profitRate)}</p>
        </div>
        <div className="w-[120px] text-right">
          <p className="text-xl font-bold text-slate-900 tabular-nums">{formatKRW(t?.revenue ?? p.revenue)}</p>
          <p className="text-xs text-slate-400">매출 (원)</p>
        </div>
      </div>
    </div>
  );
}
