'use client';

interface Tab {
  key: string;
  label: string;
  count: number;
}

interface PurchaseOrderFilterTabsProps {
  filter: string;
  tabs: Tab[];
  onFilterChange: (key: string) => void;
}

export function PurchaseOrderFilterTabs({ filter, tabs, onFilterChange }: PurchaseOrderFilterTabsProps) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onFilterChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === tab.key
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 hover:bg-slate-50'
          }`}
        >
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}
