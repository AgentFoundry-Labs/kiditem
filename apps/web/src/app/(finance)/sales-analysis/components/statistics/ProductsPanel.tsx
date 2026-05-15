import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW, formatPercent, getGradeColor } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import type { StatisticsProductRow } from '@kiditem/shared/statistics';

type ProductsPanelProps = {
  products: StatisticsProductRow[];
  page: number;
  onPageChange: (page: number) => void;
};

export function ProductsPanel({ products, page, onPageChange }: ProductsPanelProps) {
  const pagedProducts = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>등급</th>
              <th>상품명</th>
              <th className="text-right">주문수</th>
              <th className="text-right">매출</th>
              <th className="text-right">순이익</th>
              <th className="text-right">이익률</th>
            </tr>
          </thead>
          <tbody>
            {pagedProducts.map((product, index) => {
              const rowNumber = (page - 1) * PAGE_SIZE + index + 1;
              return (
                <tr key={product.listingId}>
                  <td className="tabular-nums text-[var(--text-muted)]">
                    {rowNumber}
                  </td>
                  <td>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        getGradeColor(product.grade ?? 'N/A'),
                      )}
                    >
                      {product.grade ?? 'N/A'}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                    {product.productName}
                  </td>
                  <td className="text-right tabular-nums">{product.orderCount}</td>
                  <td className="text-right tabular-nums">
                    {formatKRW(product.totalRevenue)}원
                  </td>
                  <td
                    className={cn(
                      'text-right tabular-nums',
                      product.netProfit < 0 ? 'text-red-600' : 'text-green-600',
                    )}
                  >
                    {formatKRW(product.netProfit)}원
                  </td>
                  <td
                    className={cn(
                      'text-right tabular-nums font-semibold',
                      product.profitRate < 0
                        ? 'text-red-600'
                        : product.profitRate <= 0.03
                          ? 'text-amber-600'
                          : 'text-green-600',
                    )}
                  >
                    {formatPercent(product.profitRate * 100)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        limit={PAGE_SIZE}
        total={products.length}
        onPageChange={onPageChange}
      />
    </div>
  );
}
