import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW, formatPercent } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import { StatBox } from './StatBox';
import type { StatisticsParetoResponse } from '@kiditem/shared/statistics';

type ParetoPanelProps = {
  pareto: StatisticsParetoResponse;
  page: number;
  onPageChange: (page: number) => void;
};

const PARETO_BAND_LABEL = {
  top70: '누적 70% 이하',
  next20: '누적 70~90%',
  tail10: '누적 90% 초과',
} as const;

const PARETO_BAND_COLOR = {
  top70: 'bg-green-100 text-green-700',
  next20: 'bg-amber-100 text-amber-700',
  tail10: 'bg-slate-100 text-slate-600',
} as const;

export function ParetoPanel({ pareto, page, onPageChange }: ParetoPanelProps) {
  const pagedPareto = pareto.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="총 매출" value={formatKRW(pareto.totalRevenue)} unit="원" />
        <StatBox label="누적 70% 이하" value={pareto.bandDistribution.top70} unit="개" />
        <StatBox label="누적 70~90%" value={pareto.bandDistribution.next20} unit="개" />
        <StatBox label="누적 90% 초과" value={pareto.bandDistribution.tail10} unit="개" />
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead className="sticky top-0">
              <tr>
                <th>#</th>
                <th>상품명</th>
                <th>매출 구간</th>
                <th className="text-right">매출</th>
                <th className="text-right">매출비율</th>
                <th className="text-right">누적비율</th>
              </tr>
            </thead>
            <tbody>
              {pagedPareto.map((item) => (
                <tr key={item.id}>
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
                        PARETO_BAND_COLOR[item.paretoBand],
                      )}
                    >
                      {PARETO_BAND_LABEL[item.paretoBand]}
                    </span>
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
