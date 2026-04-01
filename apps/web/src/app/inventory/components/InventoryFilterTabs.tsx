'use client';

import type { InventorySummary } from '@kiditem/shared';

interface InventoryFilterTabsProps {
  filter: string;
  summary: InventorySummary;
  onFilterChange: (key: string) => void;
}

export function InventoryFilterTabs({ filter, summary, onFilterChange }: InventoryFilterTabsProps) {
  const tabs = [
    { key: 'all', label: '전체', count: summary.total },
    { key: 'reorder', label: '발주 필요', count: summary.reorderCount },
    { key: 'overstock', label: '과재고', count: summary.overstockCount },
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((f) => (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}
        >
          {f.label} ({f.count.toLocaleString('ko-KR')})
        </button>
      ))}
    </div>
  );
}
