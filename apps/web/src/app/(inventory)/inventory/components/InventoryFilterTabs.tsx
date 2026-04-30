'use client';

import { cn, formatNumber } from '@/lib/utils';
import type { InventorySummary } from '@kiditem/shared/inventory';
import type { InventoryFilterKey } from '../../_shared/inventory-api';

interface InventoryFilterTabsProps {
  filter: InventoryFilterKey;
  summary: InventorySummary;
  onFilterChange: (key: InventoryFilterKey) => void;
}

export function InventoryFilterTabs({ filter, summary, onFilterChange }: InventoryFilterTabsProps) {
  const tabs: { key: InventoryFilterKey; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: summary.total },
    { key: 'low', label: '재고 부족', count: summary.low },
    { key: 'out', label: '재고 없음', count: summary.out },
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((f) => (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium',
            filter === f.key
              ? 'bg-purple-600 text-white'
              : 'bg-card border border-border text-foreground hover:bg-muted',
          )}
        >
          {f.label} ({formatNumber(f.count)})
        </button>
      ))}
    </div>
  );
}
