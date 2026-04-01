'use client';
import type { ProductListItem as Product } from '@kiditem/shared';
import { formatKRW, formatPercent, getProfitColor } from '@/lib/utils';

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${checked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
      {checked ? '\u2713' : '\u2717'} {label}
    </span>
  );
}

export default function CoreProductsGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        A등급 상품이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {products.map((p) => (
        <div key={p.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-900">{p.name}</h3>
              <span className="text-xs text-slate-500">{p.sku} | {p.company}</span>
            </div>
            {p.adTier && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">{p.adTier}</span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs">매출</div>
              <div className="font-semibold">{formatKRW(p.revenue)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">순이익</div>
              <div className={`font-semibold ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">이익률</div>
              <div className={`font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">광고비율</div>
              <div className={`font-semibold ${p.adRate > 15 ? 'text-red-600' : 'text-slate-700'}`}>
                {p.adRate > 0 ? formatPercent(p.adRate) : '-'}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
            <span>재고: <strong className={p.currentStock < 20 ? 'text-red-600' : 'text-slate-700'}>{p.currentStock}개</strong></span>
            <span>리뷰: <strong>{p.reviewCount}개</strong></span>
            <span>CTR: <strong>{p.thumbnailCTR}%</strong></span>
            <span>판매가: {formatKRW(p.sellPrice)}원</span>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">전략 체크</div>
            <div className="flex gap-2 flex-wrap">
              <CheckItem label="가격 경쟁력" checked={p.sellPrice > 0} />
              <CheckItem label="묶음/세트" checked={false} />
              <CheckItem label="썸네일" checked={p.thumbnailCTR > 2} />
              <CheckItem label="리뷰 관리" checked={p.reviewCount > 10} />
              <CheckItem label="광고 효율" checked={p.adRate <= 15} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
