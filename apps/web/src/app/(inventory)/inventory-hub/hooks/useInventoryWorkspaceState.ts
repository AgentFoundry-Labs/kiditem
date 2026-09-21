'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  InventorySkuStockStatus,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';
import type { SellpiaInventorySkuListParams } from '../../_shared/inventory-api';
import { useInventoryList } from '../../inventory/hooks/useInventory';

export const INVENTORY_PAGE_SIZE = 50;
export type InventoryLinkStatusFilter = SellpiaInventorySkuLinkStatus | 'all';

export function useInventoryWorkspaceState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const page = positivePage(searchParams.get('page'));
  const stockStatus = parseValue(
    searchParams.get('stockStatus'),
    ['all', 'in_stock', 'out_of_stock'] as const,
    'in_stock',
  );
  const linkStatus = parseValue(
    searchParams.get('linkStatus'),
    ['all', 'linked', 'unlinked'] as const,
    'all',
  );

  useEffect(() => setSearch(urlSearch), [urlSearch]);

  const requestParams = useMemo(() => ({
    page,
    limit: INVENTORY_PAGE_SIZE,
    query: urlSearch.trim() || undefined,
    stockStatus,
    linkStatus: linkStatus === 'all' ? undefined : linkStatus,
  } satisfies SellpiaInventorySkuListParams), [
    linkStatus,
    page,
    stockStatus,
    urlSearch,
  ]);
  const query = useInventoryList(requestParams);

  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tab');
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }, [pathname, router, searchParams]);

  return {
    ...query,
    linkStatus,
    page,
    requestParams,
    search,
    setSearch,
    stockStatus,
    submitSearch: () => updateParams({ search: search.trim() || undefined, page: '1' }),
    setLinkStatus: (value: InventoryLinkStatusFilter) => updateParams({
      linkStatus: value === 'all' ? undefined : value,
      page: '1',
    }),
    setPage: (value: number) => updateParams({ page: String(Math.max(1, value)) }),
    setStockStatus: (value: InventorySkuStockStatus) => updateParams({
      stockStatus: value === 'in_stock' ? undefined : value,
      page: '1',
    }),
  };
}

function positivePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseValue<const T extends readonly string[]>(
  value: string | null,
  values: T,
  fallback: T[number],
): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}
