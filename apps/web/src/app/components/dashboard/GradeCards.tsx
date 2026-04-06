import Link from 'next/link';
import { cn } from '@/lib/utils';

interface GradeCardsProps {
  gradeCount: Record<string, number>;
  warnings: {
    minusProducts: number;
    lowProfitProducts: number;
    highAdProducts: number;
  };
  totalProducts: number;
}

export default function GradeCards({ gradeCount, warnings, totalProducts }: GradeCardsProps) {
  return (
    <>
      {/* ABC Grade Cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = gradeCount[g] || 0;
          const pct = totalProducts > 0 ? Math.round((count / totalProducts) * 100) : 0;
          const config = {
            A: { left: 'border-l-green-500', color: 'text-green-600', bar: 'bg-green-500', label: '핵심상품', href: '/products?grade=A' },
            B: { left: 'border-l-yellow-500', color: 'text-yellow-600', bar: 'bg-yellow-500', label: '성장상품', href: '/products?grade=B' },
            C: { left: 'border-l-red-500', color: 'text-red-600', bar: 'bg-red-500', label: '정리대상', href: '/products?grade=C' },
          }[g];
          return (
            <Link key={g} href={config.href} className={cn('bg-white rounded-xl border border-slate-200 border-l-4 p-4 hover:shadow-md transition-all', config.left)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-sm font-bold', config.color)}>{g}등급</span>
                <span className="text-xs text-slate-400">{config.label}</span>
              </div>
              <div className={cn('text-2xl font-extrabold tabular-nums', config.color)}>{count}<span className="text-sm ml-0.5">개</span></div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', config.bar)} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-slate-400 mt-1">{pct}% of {totalProducts}</div>
            </Link>
          );
        })}
      </div>

      {/* Warning Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/products?grade=C" className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-red-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-red-600 mb-1">적자 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-red-600">{warnings.minusProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-slate-400 mt-1">이익률 마이너스</div>
        </Link>
        <Link href="/products?grade=C" className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-orange-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-orange-600 mb-1">저이익 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-orange-600">{warnings.lowProfitProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-slate-400 mt-1">이익률 3% 이하</div>
        </Link>
        <Link href="/profit-loss" className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-amber-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-amber-600 mb-1">광고비 초과</div>
          <div className="text-2xl font-extrabold tabular-nums text-amber-600">{warnings.highAdProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-slate-400 mt-1">광고비율 15% 초과</div>
        </Link>
      </div>
    </>
  );
}
