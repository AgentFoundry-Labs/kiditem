import {
  cn,
  formatKRW,
  getAdCostColor,
  getGradeTextColor,
  getProfitAmountColor,
} from '@/lib/utils';
import type { StatisticsGradeRow } from '@kiditem/shared/statistics';

type GradesPanelProps = {
  grades: StatisticsGradeRow[];
};

export function GradesPanel({ grades }: GradesPanelProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[...grades]
        .sort((left, right) => left.grade.localeCompare(right.grade))
        .map((grade) => (
          <div
            key={grade.grade}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
          >
            <div className={cn('text-2xl font-bold', getGradeTextColor(grade.grade))}>
              {grade.grade}등급
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {grade.count === null ? '-' : `${grade.count}개 상품`}
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">매출</span>
                <span className="font-semibold tabular-nums">
                  {grade.revenue === null ? '-' : `${formatKRW(grade.revenue)}원`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">순이익</span>
                <span
                  className={cn('font-semibold tabular-nums', getProfitAmountColor(grade.profit))}
                >
                  {grade.profit === null ? '-' : `${formatKRW(grade.profit)}원`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">광고비</span>
                <span className={cn('font-semibold tabular-nums', getAdCostColor(grade.adCost))}>
                  {grade.adCost === null ? '-' : `${formatKRW(grade.adCost)}원`}
                </span>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
