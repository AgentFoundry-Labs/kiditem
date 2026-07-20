'use client';

import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  InventorySkuStockStatus,
  SellpiaInventorySkuActiveStatus,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';

interface SellpiaOptionFiltersProps {
  activeStatus: SellpiaInventorySkuActiveStatus;
  linkStatus: SellpiaInventorySkuLinkStatus | 'all';
  search: string;
  stockStatus: InventorySkuStockStatus;
  onActiveStatusChange: (value: SellpiaInventorySkuActiveStatus) => void;
  onLinkStatusChange: (value: SellpiaInventorySkuLinkStatus | 'all') => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent) => void;
  onStockStatusChange: (value: InventorySkuStockStatus) => void;
}

const STOCK_FILTERS: Array<{
  label: string;
  value: InventorySkuStockStatus;
}> = [
  { label: '전체', value: 'all' },
  { label: '재고 있음', value: 'in_stock' },
  { label: '품절', value: 'out_of_stock' },
];

const ACTIVE_FILTERS: Array<{
  label: string;
  value: SellpiaInventorySkuActiveStatus;
}> = [
  { label: '활성', value: 'active' },
  { label: '비활성', value: 'inactive' },
  { label: '전체 상태', value: 'all' },
];

const LINK_FILTERS: Array<{
  label: string;
  value: SellpiaInventorySkuLinkStatus | 'all';
}> = [
  { label: '전체 연결', value: 'all' },
  { label: '연결됨', value: 'linked' },
  { label: '미연결', value: 'unlinked' },
];

export default function SellpiaOptionFilters({
  activeStatus,
  linkStatus,
  search,
  stockStatus,
  onActiveStatusChange,
  onLinkStatusChange,
  onSearchChange,
  onSearchSubmit,
  onStockStatusChange,
}: SellpiaOptionFiltersProps) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <form role="search" onSubmit={onSearchSubmit} className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          aria-label="Sellpia 재고 검색"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="상품코드 · 상품명 · 옵션명 · 바코드 검색"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </form>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FilterGroup
          label="재고 상태"
          options={STOCK_FILTERS}
          selected={stockStatus}
          onChange={onStockStatusChange}
        />
        <FilterGroup
          label="활성 상태"
          options={ACTIVE_FILTERS}
          selected={activeStatus}
          onChange={onActiveStatusChange}
        />
        <FilterGroup
          label="연결 상태"
          options={LINK_FILTERS}
          selected={linkStatus}
          onChange={onLinkStatusChange}
        />
        <span className="text-xs text-slate-500">
          Sellpia 최신 전체 스냅샷 기준
        </span>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: T }>;
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            selected === option.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
