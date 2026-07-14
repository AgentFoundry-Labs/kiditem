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
    { key: 'out_of_stock', label: '재고 없음', count: summary.outOfStockSkus },
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
              ? 'border-purple-600 bg-purple-600 text-white'
              : 'border-border bg-card text-foreground hover:bg-slate-50',
          )}
        >
          {item.label} ({formatNumber(item.count)})
        </button>
      ))}
    </div>
  );
}
