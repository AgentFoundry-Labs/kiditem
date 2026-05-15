import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import type { StatisticsCategoryRow } from '@kiditem/shared/statistics';

type CategoriesPanelProps = {
  categories: StatisticsCategoryRow[];
  page: number;
  onPageChange: (page: number) => void;
};

export function CategoriesPanel({
  categories,
  page,
  onPageChange,
}: CategoriesPanelProps) {
  const pagedCategories = categories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>카테고리</th>
              <th className="text-right">상품수</th>
              <th className="text-right">매출</th>
              <th className="text-right">순이익</th>
            </tr>
          </thead>
          <tbody>
            {pagedCategories.map((category) => (
              <tr key={category.category}>
                <td className="font-medium text-[var(--text-primary)]">
                  {category.name}
                </td>
                <td className="text-right tabular-nums">{category.count}개</td>
                <td className="text-right tabular-nums">
                  {formatKRW(category.revenue)}원
                </td>
                <td
                  className={cn(
                    'text-right tabular-nums',
                    category.profit < 0 ? 'text-red-600' : 'text-green-600',
                  )}
                >
                  {formatKRW(category.profit)}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        limit={PAGE_SIZE}
        total={categories.length}
        onPageChange={onPageChange}
      />
    </div>
  );
}
