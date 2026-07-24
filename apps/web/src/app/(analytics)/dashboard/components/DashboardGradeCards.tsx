import Link from 'next/link';
import { cn } from '@/lib/utils';

type ProductAbcGrade = 'A' | 'B' | 'C';

type DashboardGradeCardsProps = {
  gradeCount: Record<ProductAbcGrade, number>;
  classifiedProductCount: number;
  unclassifiedProductCount: number;
};

const GRADE_LABELS: Record<ProductAbcGrade, string> = {
  A: '핵심상품',
  B: '성장상품',
  C: '정리대상',
};

export function DashboardGradeCards({
  gradeCount,
  classifiedProductCount,
  unclassifiedProductCount,
}: DashboardGradeCardsProps) {
  return (
    <section className="space-y-2" aria-label="자동 ABC 등급 현황">
      <div className="flex justify-end text-xs text-slate-400">
        미분류 {unclassifiedProductCount}개
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['A', 'B', 'C'] as const).map((grade) => {
          const count = gradeCount[grade] ?? 0;
          const percent =
            classifiedProductCount > 0
              ? Math.round((count / classifiedProductCount) * 100)
              : 0;
          return (
            <Link
              key={grade}
              href={`/product-hub?abcGrade=${grade}`}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{grade}등급</span>
                <span className="text-xs text-slate-400">{GRADE_LABELS[grade]}</span>
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-slate-900">
                {count}<span className="ml-0.5 text-sm">개</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    'h-full rounded-full',
                    grade === 'C' ? 'bg-red-500' : 'bg-purple-600',
                  )}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-400">
                평가대상 중 {percent}%
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
