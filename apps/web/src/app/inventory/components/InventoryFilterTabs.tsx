'use client';

import { cn, formatNumber } from '@/lib/utils';
import type { InventorySummary } from '@kiditem/shared';

interface InventoryFilterTabsProps {
  filter: string;
  summary: InventorySummary;
  onFilterChange: (key: string) => void;
}

export function InventoryFilterTabs({ filter, summary, onFilterChange }: InventoryFilterTabsProps) {
  const tabs = [
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
          className={cn('px-4 py-2 rounded-lg text-sm font-medium', filter === f.key ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50')}
        >
          {f.label} ({formatNumber(f.count)})
        </button>
      ))}
    </div>
  );
}
