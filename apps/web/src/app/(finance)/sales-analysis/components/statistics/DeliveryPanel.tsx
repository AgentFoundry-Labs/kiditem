import { Pagination } from '@/components/ui/Pagination';
import { formatKRW } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import type { StatisticsDeliveryResponse } from '@kiditem/shared/statistics';

type DeliveryPanelProps = {
  delivery: StatisticsDeliveryResponse;
  page: number;
  onPageChange: (page: number) => void;
};

export function DeliveryPanel({ delivery, page, onPageChange }: DeliveryPanelProps) {
  const dailySorted = [...delivery.daily].reverse();
  const pagedDaily = dailySorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="table-card">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th className="text-right">배송건수</th>
                <th className="text-right">주문수</th>
                <th className="text-right">매출</th>
                <th className="text-right">수량</th>
              </tr>
            </thead>
            <tbody>
              {pagedDaily.map((daily) => (
                <tr key={daily.date}>
                  <td className="font-mono text-[var(--text-secondary)]">
                    {daily.date}
                  </td>
                  <td className="text-right tabular-nums">{daily.count}건</td>
                  <td className="text-right tabular-nums">{daily.orders}건</td>
                  <td className="text-right tabular-nums">
                    {formatKRW(daily.revenue)}원
                  </td>
                  <td className="text-right tabular-nums">{daily.qty}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={dailySorted.length}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
