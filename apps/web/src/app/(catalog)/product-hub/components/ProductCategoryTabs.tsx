'use client';

import { cn } from '@/lib/utils';
import { CATEGORY_TABS } from '../lib/product-page-config';

export function ProductCategoryTabs({
  category,
  onCategoryChange,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
        {CATEGORY_TABS.map((tab) => {
          const value = tab.key === 'all' ? '' : tab.label;
          const isSelected = category === value;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onCategoryChange(value)}
              className={cn(
                'h-10 shrink-0 rounded-xl px-4 text-sm font-extrabold transition-colors',
                isSelected
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
