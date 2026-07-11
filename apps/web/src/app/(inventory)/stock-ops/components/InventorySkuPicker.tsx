'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import {
  listSellpiaInventorySkus,
  sellpiaInventoryKeyParams,
} from '../../_shared/inventory-api';

interface InventorySkuPickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export default function InventorySkuPicker({ value, onChange, label }: InventorySkuPickerProps) {
  const [query, setQuery] = useState('');
  const params = { page: 1, limit: 50, query: query.trim() || undefined };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.snapshot(sellpiaInventoryKeyParams(params)),
    queryFn: () => listSellpiaInventorySkus(params),
  });

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[var(--text-primary)]">
        {label} 검색
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sellpia 코드, 상품명, 옵션, 바코드"
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-medium text-[var(--text-primary)]">
        {label}
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">{isLoading ? '불러오는 중...' : 'InventorySku를 선택하세요'}</option>
          {(data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.sellpiaProductCode} · {item.name} · {item.optionName ?? '옵션 없음'} · 현재고 {formatNumber(item.currentStock)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
