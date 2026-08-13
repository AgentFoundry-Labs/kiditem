'use client';

import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import type {
  InventorySkuStockStatus,
  SellpiaInventorySkuActiveStatus,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';
import { cn } from '@/lib/utils';

type InventoryLinkStatusFilter = SellpiaInventorySkuLinkStatus | 'all';

interface InventoryFiltersProps {
  activeStatus: SellpiaInventorySkuActiveStatus;
  linkStatus: InventoryLinkStatusFilter;
  search: string;
  stockStatus: InventorySkuStockStatus;
  onActiveStatusChange: (value: SellpiaInventorySkuActiveStatus) => void;
  onLinkStatusChange: (value: InventoryLinkStatusFilter) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStockStatusChange: (value: InventorySkuStockStatus) => void;
}

const STOCK_FILTERS = [
  { label: '전체', value: 'all' },
  { label: '재고 있음', value: 'in_stock' },
  { label: '품절', value: 'out_of_stock' },
] satisfies Array<{ label: string; value: InventorySkuStockStatus }>;

const ACTIVE_FILTERS = [
  { label: '전체 상태', value: 'all' },
  { label: '활성', value: 'active' },
  { label: '비활성', value: 'inactive' },
] satisfies Array<{ label: string; value: SellpiaInventorySkuActiveStatus }>;

const LINK_FILTERS = [
  { label: '전체 연결', value: 'all' },
  { label: '연결됨', value: 'linked' },
  { label: '미연결', value: 'unlinked' },
] satisfies Array<{ label: string; value: InventoryLinkStatusFilter }>;

export function InventoryFilters({
  activeStatus,
  linkStatus,
  search,
  stockStatus,
  onActiveStatusChange,
  onLinkStatusChange,
  onSearchChange,
  onSearchSubmit,
  onStockStatusChange,
}: InventoryFiltersProps) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <form role="search" onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative min-w-64 flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            type="search"
            aria-label="Sellpia 재고 검색"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Sellpia 코드 · 상품명 · 옵션명 · 바코드 검색"
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
        >
          검색
        </button>
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
        <span className="text-xs text-[var(--text-secondary)]">Sellpia 최신 전체 스냅샷 기준</span>
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
