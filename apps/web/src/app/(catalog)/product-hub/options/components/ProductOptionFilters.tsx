'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProductOptionFilterState {
  search: string;
  bundleScope: 'all' | 'bundle' | 'simple';
  activeScope: 'active' | 'inactive' | 'all';
  temporaryOnly: boolean;
  includeDeleted: boolean;
}

interface Props {
  draftSearch: string;
  state: ProductOptionFilterState;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: () => void;
  onChange: (next: Partial<ProductOptionFilterState>) => void;
}

export default function ProductOptionFilters({
  draftSearch,
  state,
  onSearchInputChange,
  onSearchSubmit,
  onChange,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
        className="relative"
      >
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={draftSearch}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder="SKU · 옵션명 · 판매자 상품코드 검색"
          className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </form>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'simple', 'bundle'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ bundleScope: key })}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                state.bundleScope === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {key === 'all' ? '전체' : key === 'simple' ? '단일 SKU' : '번들'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['active', 'inactive', 'all'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ activeScope: key })}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                state.activeScope === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {key === 'active' ? '활성' : key === 'inactive' ? '비활성' : '전체 상태'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={state.temporaryOnly}
            onChange={(e) => onChange({ temporaryOnly: e.target.checked })}
            className="rounded border-slate-300"
          />
          임시(temporary) 만
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={state.includeDeleted}
            onChange={(e) =>
              onChange({ includeDeleted: e.target.checked })
            }
            className="rounded border-slate-300"
          />
          삭제된 옵션 포함
        </label>
      </div>
    </div>
  );
}
