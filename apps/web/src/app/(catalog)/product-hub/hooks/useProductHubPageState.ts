import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  MasterProductOperationsListResponseSchema,
  ProductInventoryStatusSchema,
  ProductOperationsInventoryFocusSchema,
  type ProductInventoryStatus,
  type ProductOperationsActiveStatus,
  type ProductOperationsAdStatus,
  type ProductOperationsInventoryFocus,
  type ProductOperationsPeriodDays,
  type ProductOperationsSort,
} from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export const PAGE_SIZE = 50;

type ProductInventoryStatusFilter = ProductInventoryStatus | 'all';
type ProductInventoryFocusFilter = ProductOperationsInventoryFocus | 'all';

const INVENTORY_STATUSES: readonly ProductInventoryStatusFilter[] = [
  'all',
  ...ProductInventoryStatusSchema.options,
];
const INVENTORY_FOCUSES: readonly ProductInventoryFocusFilter[] = [
  'all',
  ...ProductOperationsInventoryFocusSchema.options,
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
// Profit and margin are exposed by the shared API contract, but the current
// monthly response has no cost basis, so the page cannot offer meaningful
// client navigation for those URL values yet.
const SORTS: readonly ProductOperationsSort[] = ['latest', 'revenue', 'sold', 'stock'];
export function useProductHubPageState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const inventoryStatusParam = searchParams.get('inventoryStatus');
  const inventoryFocusParam = searchParams.get('inventoryFocus');
  const activeStatusParam = searchParams.get('activeStatus');
  const adStatusParam = searchParams.get('adStatus');
  const periodDaysParam = Number(searchParams.get('periodDays'));
  const sortParam = searchParams.get('sort');
  const sort: ProductOperationsSort = SORTS.includes(sortParam as ProductOperationsSort)
    ? sortParam as ProductOperationsSort
    : 'latest';
  const pageParam = Number(searchParams.get('page'));
  const inventoryStatus = INVENTORY_STATUSES.includes(
    inventoryStatusParam as ProductInventoryStatusFilter,
  )
    ? inventoryStatusParam as ProductInventoryStatusFilter
    : 'all';
  const inventoryFocus = INVENTORY_FOCUSES.includes(
    inventoryFocusParam as ProductInventoryFocusFilter,
  )
    ? inventoryFocusParam as ProductInventoryFocusFilter
    : 'all';
  const activeStatus = ACTIVE_STATUSES.includes(
    activeStatusParam as ProductOperationsActiveStatus,
  )
    ? activeStatusParam as ProductOperationsActiveStatus
    : 'active';
  const adStatus = AD_STATUSES.includes(adStatusParam as ProductOperationsAdStatus)
    ? adStatusParam as ProductOperationsAdStatus
    : 'all';
  const periodDays = PERIOD_DAYS.includes(periodDaysParam as ProductOperationsPeriodDays)
    ? periodDaysParam as ProductOperationsPeriodDays
    : 30;
  const abcGrade = searchParams.get('abcGrade') ?? '';
  const dataStatusOpen = searchParams.get('dataStatus') === 'abc';
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
      sort,
    });
    if (inventoryFocus !== 'all') params.set('inventoryFocus', inventoryFocus);
    else if (inventoryStatus !== 'all') params.set('inventoryStatus', inventoryStatus);
    if (urlSearch.trim()) params.set('query', urlSearch.trim());
    if (abcGrade.trim()) params.set('abcGrade', abcGrade.trim());
    return params;
  }, [abcGrade, activeStatus, adStatus, inventoryFocus, inventoryStatus, page, periodDays, sort, urlSearch]);

  const queryKeyParams = useMemo(
    () => Object.fromEntries(queryParams.entries()),
    [queryParams],
  );

  const overviewParams = useMemo(() => new URLSearchParams({
    page: '1',
    limit: '1',
    periodDays: String(periodDays),
    activeStatus: 'active',
    adStatus: 'all',
    sort: 'latest',
  }), [periodDays]);
  const overviewQueryKeyParams = useMemo(
    () => Object.fromEntries(overviewParams.entries()),
    [overviewParams],
  );
  const canReuseListSummary = activeStatus === 'active'
    && adStatus === 'all'
    && inventoryStatus === 'all'
    && inventoryFocus === 'all'
    && !urlSearch.trim()
    && !abcGrade.trim();

  const listQuery = useQuery({
    queryKey: queryKeys.products.operations.list(queryKeyParams),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters?${queryParams.toString()}`,
      MasterProductOperationsListResponseSchema,
    ),
    placeholderData: (previousData) => previousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const shouldReuseListSummary = canReuseListSummary && !listQuery.isPlaceholderData;
  const overviewQuery = useQuery({
    queryKey: queryKeys.products.operations.list(overviewQueryKeyParams),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters?${overviewParams.toString()}`,
      MasterProductOperationsListResponseSchema,
    ),
    placeholderData: (previousData) => previousData,
    enabled: !shouldReuseListSummary,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const refetch = useCallback(
    () => shouldReuseListSummary
      ? Promise.all([listQuery.refetch()])
      : Promise.all([listQuery.refetch(), overviewQuery.refetch()]),
    [overviewQuery.refetch, shouldReuseListSummary, listQuery.refetch],
  );

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
    data: listQuery.data,
    dataStatusOpen,
    errorMessage: listQuery.error
      ? (isApiError(listQuery.error) ? listQuery.error.message : '상품 운영 목록을 불러오지 못했습니다.')
      : null,
    goToPage,
    handleSearch,
    isFetching: listQuery.isFetching || overviewQuery.isFetching,
    isLoading: listQuery.isLoading,
    isPlaceholderData: listQuery.isPlaceholderData,
    inventoryStatus,
    inventoryFocus,
    overviewData: shouldReuseListSummary ? listQuery.data : overviewQuery.data,
    overviewErrorMessage: shouldReuseListSummary
      ? null
      : overviewQuery.error
      ? (isApiError(overviewQuery.error) ? overviewQuery.error.message : '전체 상품 운영 현황을 불러오지 못했습니다.')
      : null,
    page,
    periodDays,
    refetch,
    search,
    setAbcGrade: (value: string) => {
      updateListParams({
        abcGrade: value || undefined,
        page: '1',
      });
    },
    setDataStatusOpen: (open: boolean) => {
      updateListParams({ dataStatus: open ? 'abc' : undefined });
    },
    setActiveStatus: (value: ProductOperationsActiveStatus) => {
      updateListParams({ activeStatus: value, page: '1' });
    },
    setAdStatus: (value: ProductOperationsAdStatus) => {
      updateListParams({ adStatus: value === 'all' ? undefined : value, page: '1' });
    },
    setInventoryStatus: (value: ProductInventoryStatusFilter) => {
      updateListParams({
        inventoryStatus: value === 'all' ? undefined : value,
        inventoryFocus: undefined,
        page: '1',
      });
    },
    setInventoryFocus: (value: ProductInventoryFocusFilter) => {
      updateListParams({
        inventoryFocus: value === 'all' ? undefined : value,
        inventoryStatus: undefined,
        page: '1',
      });
    },
    setPeriodDays: (value: ProductOperationsPeriodDays) => {
      updateListParams({ periodDays: String(value), page: '1' });
    },
    setSearch,
    sort,
    setSort: (value: ProductOperationsSort) => {
      updateListParams({ sort: value === 'latest' ? undefined : value, page: '1' });
    },
    totalPages: Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE)),
  };
}
