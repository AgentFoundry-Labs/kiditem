'use client';

import { cn } from '@/lib/utils';

interface FilterTab {
  key: string;
  label: string;
  className?: string;
}

interface Props {
  tabs: FilterTab[];
  activeFilter: string;
  onChange: (key: string) => void;
}

export function ThumbnailFilterTabs({ tabs, activeFilter, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeFilter === tab.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
            tab.className && activeFilter !== tab.key && tab.className,
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
