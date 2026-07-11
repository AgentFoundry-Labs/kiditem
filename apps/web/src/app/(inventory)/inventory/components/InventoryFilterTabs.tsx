'use client';

import { cn, formatNumber } from '@/lib/utils';
import type {
  InventorySkuSnapshotSummary,
  InventorySkuStockStatus,
} from '@kiditem/shared/inventory';

interface InventoryFilterTabsProps {
  filter: InventorySkuStockStatus;
  summary: InventorySkuSnapshotSummary;
  onFilterChange: (filter: InventorySkuStockStatus) => void;
}

export function InventoryFilterTabs({
  filter,
  summary,
  onFilterChange,
}: InventoryFilterTabsProps) {
  const filters = [
    { key: 'all', label: '전체', count: summary.totalSkus },
    { key: 'in_stock', label: '재고 있음', count: summary.inStockSkus },
    { key: 'out_of_stock', label: '재고 0', count: summary.outOfStockSkus },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2" aria-label="재고 필터">
      {filters.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onFilterChange(item.key)}
          className={cn(
            'rounded-lg border px-4 py-2 text-sm font-medium',
            filter === item.key
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]',
          )}
        >
          {item.label} ({formatNumber(item.count)})
        </button>
      ))}
    </div>
  );
}
