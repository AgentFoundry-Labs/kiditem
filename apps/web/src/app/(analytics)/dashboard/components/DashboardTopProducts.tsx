import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import type { DashboardSalesSummary } from '@kiditem/shared/dashboard';
import { cn, formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';

export function DashboardTopProducts({
  products,
}: {
  products: DashboardSalesSummary['topProducts'];
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
      <div className="overflow-x-auto">
        <table style={{ minWidth: 600 }}>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pl-4 w-8 text-sm text-slate-400">#</th>
              <th className="w-8 text-sm text-slate-400">등급</th>
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
                <td><span className={cn('inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold', getGradeColor(product.grade))}>{product.grade}</span></td>
                <td className="text-sm font-medium max-w-[300px] truncate text-slate-900">{product.name}</td>
                <td className="text-right text-sm tabular-nums text-slate-900">{formatKRW(product.revenue)}<span className="text-slate-400">원</span></td>
                <td className={cn('text-right text-sm tabular-nums', getProfitColor(product.profitRate))}>{formatKRW(product.netProfit)}<span className="text-slate-400">원</span></td>
                <td className={cn('text-right pr-4 text-sm tabular-nums font-semibold', getProfitColor(product.profitRate))}>{formatPercent(product.profitRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
