import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { ProductAbcBadge } from '@/components/product-abc/ProductAbcBadge';
import { cn, formatKRW, formatPercent, getProfitColor } from '@/lib/utils';
import { DashboardBasisMarker, type DashboardMetricBasis } from './DashboardDataBasis';
import type { DashboardSalesSummary } from '@kiditem/shared/dashboard';

export function DashboardTopProducts({
  products,
  basis,
}: {
  products: DashboardSalesSummary['topProducts'];
  basis?: DashboardMetricBasis | null;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900">Top Revenue Products</h3>
        </div>
        <Link href="/product-hub" className="text-xs font-mono text-purple-600">VIEW ALL →</Link>
        </div>
        {basis && <DashboardBasisMarker basis={basis} />}
      <div className="overflow-x-auto">
        {products.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">표시할 상품 매출 데이터가 없습니다.</div>}
        {products.length > 0 && (
        <table style={{ minWidth: 600 }}>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pl-4 w-8 text-sm text-slate-400">#</th>
              <th className="min-w-[72px] text-sm text-slate-400">ABC</th>
              <th className="text-sm text-slate-400">상품명</th>
              <th className="text-right text-sm text-slate-400">매출</th>
              <th className="text-right text-sm text-slate-400">순이익</th>
              <th className="text-right pr-4 text-sm text-slate-400">이익률</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => (
              <tr key={product.id} className="border-b border-slate-50">
                <td className="pl-4 text-sm tabular-nums text-slate-400">{index + 1}</td>
                <td>
                  <ProductAbcBadge grade={product.grade} evaluation={product.abcEvaluation} compact />
                </td>
                <td className="text-sm font-medium max-w-[300px] truncate text-slate-900">{product.name}</td>
                <td className="text-right text-sm tabular-nums text-slate-900">{formatKRW(product.revenue)}<span className="text-slate-400">원</span></td>
                <td className={cn('text-right text-sm tabular-nums', getProfitColor(product.profitRate))}>{formatKRW(product.netProfit)}<span className="text-slate-400">원</span></td>
                <td className={cn('text-right pr-4 text-sm tabular-nums font-semibold', getProfitColor(product.profitRate))}>{formatPercent(product.profitRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
