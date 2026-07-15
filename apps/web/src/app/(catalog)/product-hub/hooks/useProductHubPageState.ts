import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  InventorySkuSnapshotListResponseSchema,
  type InventorySkuStockStatus,
  type SellpiaMasterActiveStatus,
} from '@kiditem/shared/inventory';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export const PAGE_SIZE = 50;

const STOCK_STATUSES: readonly InventorySkuStockStatus[] = [
  'all',
  'in_stock',
  'out_of_stock',
];
const ACTIVE_STATUSES: readonly SellpiaMasterActiveStatus[] = [
  'active',
  'inactive',
  'all',
];

export function useProductHubPageState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const stockStatusParam = searchParams.get('stockStatus');
  const activeStatusParam = searchParams.get('activeStatus');
  const pageParam = Number(searchParams.get('page'));
  const stockStatus = STOCK_STATUSES.includes(stockStatusParam as InventorySkuStockStatus)
    ? stockStatusParam as InventorySkuStockStatus
    : 'all';
  const activeStatus = ACTIVE_STATUSES.includes(activeStatusParam as SellpiaMasterActiveStatus)
    ? activeStatusParam as SellpiaMasterActiveStatus
    : 'active';
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  const updateListParams = useCallback((updates: Record<string, string | undefined>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '') nextParams.delete(key);
      else nextParams.set(key, value);
    });
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      stockStatus,
      activeStatus,
    });
    if (urlSearch.trim()) params.set('query', urlSearch.trim());
    return params;
  }, [activeStatus, page, stockStatus, urlSearch]);

  const queryKeyParams = useMemo(
    () => Object.fromEntries(queryParams.entries()),
    [queryParams],
  );

  const { data, error, isFetching, isLoading, isPlaceholderData, refetch } = useQuery({
    queryKey: queryKeys.inventory.snapshot(queryKeyParams),
    queryFn: () => apiClient.getParsed(
      `/api/inventory/sellpia-skus?${queryParams.toString()}`,
      InventorySkuSnapshotListResponseSchema,
    ),
    placeholderData: (previousData) => previousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    updateListParams({ search: search.trim() || undefined, page: '1' });
  };

  const goToPage = (nextPage: number) => {
    updateListParams({ page: String(Math.max(1, nextPage)) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return {
    activeStatus,
    data,
    errorMessage: error
      ? (isApiError(error) ? error.detail : 'Sellpia 상품 목록을 불러오지 못했습니다.')
      : null,
    goToPage,
    handleSearch,
    isFetching,
    isLoading,
    isPlaceholderData,
    page,
    refetch,
    search,
    setActiveStatus: (value: SellpiaMasterActiveStatus) => {
      updateListParams({ activeStatus: value, page: '1' });
    },
    setSearch,
    setStockStatus: (value: InventorySkuStockStatus) => {
      updateListParams({ stockStatus: value, page: '1' });
    },
    stockStatus,
    totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
  };
}
