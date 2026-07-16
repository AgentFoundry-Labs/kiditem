'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Layers, RefreshCw } from 'lucide-react';
import {
  InventorySkuSnapshotListResponseSchema,
  type InventorySkuStockStatus,
  type SellpiaInventorySkuActiveStatus,
  type SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import SellpiaOptionFilters from '../options/components/SellpiaOptionFilters';
import SellpiaOptionTable from '../options/components/SellpiaOptionTable';

export const SELLPIA_PAGE_SIZE = 50;
type LinkStatusFilter = SellpiaInventorySkuLinkStatus | 'all';

export function ProductOptionsWorkspace({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const state = useSellpiaInventorySkuPageState();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
            <Layers size={20} className="text-white" />
          </div>
          <div>
            <Heading className="text-2xl font-extrabold tracking-tight text-slate-900">
              셀피아 재고
            </Heading>
            <p className="mt-0.5 text-xs text-slate-500">
              Sellpia 상품코드 단위 읽기 전용 재고와 확인된 상품·옵션 연결 상태
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void state.refetch()}
          disabled={state.isFetching}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={state.isFetching ? 'animate-spin' : ''} />
          새로고침
        </button>
      </header>

      <SellpiaOptionFilters
        activeStatus={state.activeStatus}
        linkStatus={state.linkStatus}
        search={state.search}
        stockStatus={state.stockStatus}
        onActiveStatusChange={state.setActiveStatus}
        onLinkStatusChange={state.setLinkStatus}
        onSearchChange={state.setSearch}
        onSearchSubmit={state.handleSearch}
        onStockStatusChange={state.setStockStatus}
      />

      <div className="px-1 text-xs text-slate-500">
        {state.isLoading && !state.data ? '불러오는 중...' : `${state.data?.total ?? 0}개 Sellpia SKU`}
      </div>

      {state.isFetching && !state.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          Sellpia 재고를 최신 조건으로 갱신하는 중입니다.
        </div>
      ) : null}

      {state.errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Sellpia 재고를 불러오지 못했어요. {state.errorMessage}
        </div>
      ) : (
        <SellpiaOptionTable items={state.data?.items ?? []} isLoading={state.isLoading && !state.data} />
      )}

      {state.data ? (
        <Pagination page={state.page} limit={SELLPIA_PAGE_SIZE} total={state.data.total} onPageChange={state.goToPage} />
      ) : null}
    </div>
  );
}

export function useSellpiaInventorySkuPageState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const stockStatus = parseValue(searchParams.get('stockStatus'), ['all', 'in_stock', 'out_of_stock'] as const, 'all');
  const activeStatus = parseValue(searchParams.get('activeStatus'), ['all', 'active', 'inactive'] as const, 'all');
  const linkStatus = parseValue(searchParams.get('linkStatus'), ['all', 'linked', 'unlinked'] as const, 'all');

  useEffect(() => setSearch(urlSearch), [urlSearch]);

  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const params = useMemo(() => {
    const next = new URLSearchParams({
      page: String(page),
      limit: String(SELLPIA_PAGE_SIZE),
      stockStatus,
      activeStatus,
    });
    if (urlSearch.trim()) next.set('query', urlSearch.trim());
    if (linkStatus !== 'all') next.set('linkStatus', linkStatus);
    return next;
  }, [activeStatus, linkStatus, page, stockStatus, urlSearch]);
  const keyParams = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const query = useQuery({
    queryKey: queryKeys.inventory.snapshot(keyParams),
    queryFn: () => apiClient.getParsed(
      `/api/inventory/sellpia-skus?${params.toString()}`,
      InventorySkuSnapshotListResponseSchema,
    ),
    placeholderData: (previous) => previous,
  });

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ search: search.trim() || undefined, page: '1' });
  };
  const goToPage = (nextPage: number) => updateParams({ page: String(Math.max(1, nextPage)) });

  return {
    activeStatus,
    data: query.data,
    errorMessage: query.error
      ? (isApiError(query.error) ? query.error.detail : 'Sellpia SKU 목록을 불러오지 못했습니다.')
      : null,
    goToPage,
    handleSearch,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    linkStatus,
    page,
    refetch: query.refetch,
    search,
    setActiveStatus: (value: SellpiaInventorySkuActiveStatus) => updateParams({ activeStatus: value, page: '1' }),
    setLinkStatus: (value: LinkStatusFilter) => updateParams({ linkStatus: value === 'all' ? undefined : value, page: '1' }),
    setSearch,
    setStockStatus: (value: InventorySkuStockStatus) => updateParams({ stockStatus: value, page: '1' }),
    stockStatus,
  };
}

function parseValue<const T extends readonly string[]>(value: string | null, values: T, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}
