import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  MasterProductOperationsListResponseSchema,
  type ProductInventoryStatus,
  type ProductOperationsActiveStatus,
  type ProductOperationsAdStatus,
  type ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export const PAGE_SIZE = 50;

type ProductInventoryStatusFilter = ProductInventoryStatus | 'all';

const INVENTORY_STATUSES: readonly ProductInventoryStatusFilter[] = [
  'all',
  'sellable',
  'partial_out_of_stock',
  'out_of_stock',
  'configuration_required',
  'review_required',
];
const ACTIVE_STATUSES: readonly ProductOperationsActiveStatus[] = [
  'active',
  'inactive',
  'all',
];
const AD_STATUSES: readonly ProductOperationsAdStatus[] = [
  'all',
  'active',
  'inactive',
  'unconfigured',
];
const PERIOD_DAYS: readonly ProductOperationsPeriodDays[] = [7, 14, 30];

export function useProductHubPageState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const inventoryStatusParam = searchParams.get('inventoryStatus');
  const activeStatusParam = searchParams.get('activeStatus');
  const adStatusParam = searchParams.get('adStatus');
  const periodDaysParam = Number(searchParams.get('periodDays'));
  const pageParam = Number(searchParams.get('page'));
  const inventoryStatus = INVENTORY_STATUSES.includes(
    inventoryStatusParam as ProductInventoryStatusFilter,
  )
    ? inventoryStatusParam as ProductInventoryStatusFilter
    : 'all';
  const activeStatus = ACTIVE_STATUSES.includes(
    activeStatusParam as ProductOperationsActiveStatus,
  )
    ? activeStatusParam as ProductOperationsActiveStatus
    : 'all';
  const adStatus = AD_STATUSES.includes(adStatusParam as ProductOperationsAdStatus)
    ? adStatusParam as ProductOperationsAdStatus
    : 'all';
  const periodDays = PERIOD_DAYS.includes(periodDaysParam as ProductOperationsPeriodDays)
    ? periodDaysParam as ProductOperationsPeriodDays
    : 30;
  const category = searchParams.get('category') ?? '';
  const abcGrade = searchParams.get('abcGrade') ?? '';
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
      periodDays: String(periodDays),
      activeStatus,
      adStatus,
    });
    if (inventoryStatus !== 'all') params.set('inventoryStatus', inventoryStatus);
    if (urlSearch.trim()) params.set('query', urlSearch.trim());
    if (category.trim()) params.set('category', category.trim());
    if (abcGrade.trim()) params.set('abcGrade', abcGrade.trim());
    return params;
  }, [abcGrade, activeStatus, adStatus, category, inventoryStatus, page, periodDays, urlSearch]);

  const queryKeyParams = useMemo(
    () => Object.fromEntries(queryParams.entries()),
    [queryParams],
  );

  const { data, error, isFetching, isLoading, isPlaceholderData, refetch } = useQuery({
    queryKey: queryKeys.products.operations.list(queryKeyParams),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters?${queryParams.toString()}`,
      MasterProductOperationsListResponseSchema,
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
    abcGrade,
    activeStatus,
    adStatus,
    category,
    data,
    errorMessage: error
      ? (isApiError(error) ? error.detail : '상품 운영 목록을 불러오지 못했습니다.')
      : null,
    goToPage,
    handleSearch,
    isFetching,
    isLoading,
    isPlaceholderData,
    inventoryStatus,
    page,
    periodDays,
    refetch,
    search,
    setAbcGrade: (value: string) => {
      updateListParams({ abcGrade: value || undefined, page: '1' });
    },
    setActiveStatus: (value: ProductOperationsActiveStatus) => {
      updateListParams({ activeStatus: value, page: '1' });
    },
    setAdStatus: (value: ProductOperationsAdStatus) => {
      updateListParams({ adStatus: value === 'all' ? undefined : value, page: '1' });
    },
    setCategory: (value: string) => {
      updateListParams({ category: value || undefined, page: '1' });
    },
    setInventoryStatus: (value: ProductInventoryStatusFilter) => {
      updateListParams({ inventoryStatus: value === 'all' ? undefined : value, page: '1' });
    },
    setPeriodDays: (value: ProductOperationsPeriodDays) => {
      updateListParams({ periodDays: String(value), page: '1' });
    },
    setSearch,
    totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
  };
}
