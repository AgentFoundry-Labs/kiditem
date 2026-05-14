import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW, formatPercent, getGradeColor } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import { StatBox } from './StatBox';
import type { StatisticsParetoResponse } from '@kiditem/shared/statistics';

type ParetoPanelProps = {
  pareto: StatisticsParetoResponse;
  page: number;
  onPageChange: (page: number) => void;
};

export function ParetoPanel({ pareto, page, onPageChange }: ParetoPanelProps) {
  const pagedPareto = pareto.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="총 매출" value={formatKRW(pareto.totalRevenue)} unit="원" />
        <StatBox label="A등급 (70%)" value={pareto.gradeDistribution.A} unit="개" />
        <StatBox label="B등급 (20%)" value={pareto.gradeDistribution.B} unit="개" />
        <StatBox label="등급 불일치" value={pareto.mismatchCount} unit="개" />
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead className="sticky top-0">
              <tr>
                <th>#</th>
                <th>상품명</th>
                <th>현재등급</th>
                <th>추천등급</th>
                <th className="text-right">매출</th>
                <th className="text-right">매출비율</th>
                <th className="text-right">누적비율</th>
              </tr>
            </thead>
            <tbody>
              {pagedPareto.map((item) => (
                <tr
                  key={item.id}
                  className={!item.gradeMatch ? 'bg-amber-50/60' : undefined}
                >
                  <td className="tabular-nums text-[var(--text-muted)]">
                    {item.rank}
                  </td>
                  <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                    {item.name}
                  </td>
                  <td>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        getGradeColor(item.currentGrade),
                      )}
                    >
                      {item.currentGrade}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        getGradeColor(item.suggestedGrade),
                      )}
                    >
                      {item.suggestedGrade}
                    </span>
                    {!item.gradeMatch && (
                      <span className="ml-1 text-[9px] text-red-500">불일치</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatKRW(item.revenue)}원
                  </td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">
                    {formatPercent(item.revenuePercent)}
                  </td>
                  <td
                    className={cn(
                      'text-right tabular-nums font-medium',
                      item.cumulativePercent <= 70
                        ? 'text-green-600'
                        : item.cumulativePercent <= 90
                          ? 'text-amber-600'
                          : 'text-red-600',
                    )}
                  >
                    {formatPercent(item.cumulativePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={pareto.data.length}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
