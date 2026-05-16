'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface ToolbarOption<T extends string> {
  value: T;
  label: string;
}

interface ToolbarTab<T extends string> {
  key: T;
  label: string;
}

interface ProductInboxToolbarProps<TabKey extends string, SortKey extends string> {
  tabs: ReadonlyArray<ToolbarTab<TabKey>>;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  sort: SortKey;
  sortOptions: ReadonlyArray<ToolbarOption<SortKey>>;
  onSortChange: (sort: SortKey) => void;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageSizeChange: (pageSize: number) => void;
  actions?: ReactNode;
}

export function ProductInboxToolbar<TabKey extends string, SortKey extends string>({
  tabs,
  activeTab,
  onTabChange,
  sort,
  sortOptions,
  onSortChange,
  pageSize,
  pageSizeOptions = [20, 50, 100],
  onPageSizeChange,
  actions,
}: ProductInboxToolbarProps<TabKey, SortKey>) {
  return (
    <div className="flex h-12 items-center justify-between gap-3 border-b border-slate-200 px-5">
      <div className="flex items-center gap-1 text-xs">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onTabChange(tab.key)}
              className={
                selected
                  ? 'rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 ring-1 ring-emerald-200'
                  : 'rounded-md px-3 py-2 font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <label className="relative">
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="h-7 appearance-none rounded-md bg-transparent px-2.5 pr-6 font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-300"
            aria-label="상품 정렬"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
        </label>
        <label className="relative">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-7 appearance-none rounded-md bg-transparent px-2.5 pr-6 font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-300"
            aria-label="페이지당 상품 개수"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}개씩
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
        </label>
        {actions && (
          <>
            <div className="mx-1 h-4 w-px bg-slate-200" />
            {actions}
          </>
        )}
      </div>
    </div>
  );
}
