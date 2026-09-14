import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { cn, formatKRW, formatPercent, getProfitAmountColor, getProfitColor } from '@/lib/utils';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';
import type { DashboardSalesSummary } from '@kiditem/shared/dashboard';
import type { ProductAbcGrade } from '@kiditem/shared/product-abc';

/**
 * The panel holds this many rows whether or not there is data for them.
 *
 * It used to render one centred line when empty and a row per product when not,
 * so the panel — and everything below it — moved as soon as a collection landed.
 * A dashboard an operator reads every day should put each number in the same
 * place; the difference between an empty day and a full one belongs in the
 * values, not in the layout.
 */
const ROW_SLOTS = 6;

/** DESIGN.md's grade colours. The shared product-hub badge is a 36px coloured
 *  pill in emerald/amber/rose — a different scale and a different palette from
 *  this table, which is why it read as borrowed. */
const GRADE_CLASS: Record<ProductAbcGrade, string> = {
  A: 'text-primary',
  B: 'text-slate-600',
  C: 'text-orange-600',
};

export function DashboardTopProducts({
  products,
  basis,
}: {
  products: DashboardSalesSummary['topProducts'];
  basis?: DashboardMetricBasis | null;
}) {
  const rows = products.slice(0, ROW_SLOTS);
  const blanks = Math.max(0, ROW_SLOTS - rows.length);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Top 상품 · 매출순</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/product-hub" className="text-[13px] font-semibold text-violet-700 hover:text-violet-900">전체 보기 →</Link>
          <DashboardBasisDisclosure
            label="Top 상품 근거"
            entries={[{ label: '상품 매출', basis }]}
            meaning={(
              <p>
                선택한 기간의 매출 상위 {ROW_SLOTS}개입니다. 매출은 항상 측정되지만 순이익은
                그렇지 않아, 정산 근거가 없는 행은 순이익과 이익률이 <code>—</code>로 남습니다.
                로켓 발주분처럼 리스팅에 붙지 않는 매출도 순위에는 들어갑니다.
              </p>
            )}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table style={{ minWidth: 600 }}>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pl-4 text-sm text-slate-400">상품</th>
              <th className="w-16 whitespace-nowrap text-center text-sm text-slate-400">등급</th>
              <th className="text-right text-sm text-slate-400">매출</th>
              <th className="text-right text-sm text-slate-400">순이익</th>
              <th className="text-right pr-4 text-sm text-slate-400">이익률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b border-slate-50">
                <td className="pl-4 max-w-[300px] truncate text-sm font-medium text-slate-900">{product.name}</td>
                <td className={cn('text-center text-sm font-bold', product.grade ? GRADE_CLASS[product.grade] : 'text-slate-300')}
                    title={product.grade ? `${product.grade}등급` : '미분류'}>
                  {product.grade ?? '—'}
                </td>
                <td className="text-right text-sm tabular-nums text-slate-900">{formatKRW(product.revenue)}<span className="text-slate-400">원</span></td>
                {/* Revenue is always measured; profit is not. A row whose profit
                    the backend withheld shows the absent-value dash rather than a
                    figure the screen cannot account for. */}
                <td className={cn('text-right text-sm tabular-nums', getProfitAmountColor(product.netProfit))}>
                  {product.netProfit === null ? '—' : <>{formatKRW(product.netProfit)}<span className="text-slate-400">원</span></>}
                </td>
                <td className={cn('text-right pr-4 text-sm tabular-nums font-semibold', getProfitColor(product.profitRate))}>
                  {product.profitRate === null ? '—' : formatPercent(product.profitRate)}
                </td>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <tr key={`slot-${index}`} className="border-b border-slate-50" aria-hidden="true">
                <td className="pl-4 text-sm text-slate-300">—</td>
                <td className="text-center text-sm text-slate-300">—</td>
                <td className="text-right text-sm tabular-nums text-slate-300">—</td>
                <td className="text-right text-sm tabular-nums text-slate-300">—</td>
                <td className="text-right pr-4 text-sm tabular-nums text-slate-300">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
