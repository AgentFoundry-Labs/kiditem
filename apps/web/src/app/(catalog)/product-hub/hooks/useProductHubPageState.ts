import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
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

export function useProductHubPageState() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const [submittedSearch, setSubmittedSearch] = useState(urlSearch);
  const [stockStatus, setStockStatus] = useState<InventorySkuStockStatus>('all');
  const [activeStatus, setActiveStatus] = useState<SellpiaMasterActiveStatus>('active');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSearch(urlSearch);
    setSubmittedSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      stockStatus,
      activeStatus,
    });
    if (submittedSearch.trim()) params.set('query', submittedSearch.trim());
    return params;
  }, [activeStatus, page, stockStatus, submittedSearch]);

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
    setSubmittedSearch(search);
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
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
      setActiveStatus(value);
      setPage(1);
    },
    setSearch,
    setStockStatus: (value: InventorySkuStockStatus) => {
      setStockStatus(value);
      setPage(1);
    },
    stockStatus,
    totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
  };
}
