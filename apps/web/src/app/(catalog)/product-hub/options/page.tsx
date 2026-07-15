'use client';

import { Layers, RefreshCw } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { PAGE_SIZE, useProductHubPageState } from '../hooks/useProductHubPageState';
import SellpiaOptionFilters from './components/SellpiaOptionFilters';
import SellpiaOptionTable from './components/SellpiaOptionTable';

export default function ProductHubOptionsPage() {
  const state = useProductHubPageState();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
            <Layers size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              상품 옵션 관리
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Sellpia 상품코드 단위 — 상품명 / 옵션명 / 바코드 / 매입가 / 판매가 / 재고 / 활성 상태
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
        search={state.search}
        stockStatus={state.stockStatus}
        onActiveStatusChange={state.setActiveStatus}
        onSearchChange={state.setSearch}
        onSearchSubmit={state.handleSearch}
        onStockStatusChange={state.setStockStatus}
      />

      <div className="px-1 text-xs text-slate-500">
        {state.isLoading && !state.data
          ? '불러오는 중...'
          : `${state.data?.total ?? 0}개 옵션`}
      </div>

      {state.isFetching && !state.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          옵션 목록을 최신 조건으로 갱신하는 중입니다.
        </div>
      ) : null}

      {state.errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          옵션 목록을 불러오지 못했어요. {state.errorMessage}
        </div>
      ) : (
        <SellpiaOptionTable
          items={state.data?.items ?? []}
          isLoading={state.isLoading && !state.data}
        />
      )}

      {state.data ? (
        <Pagination
          page={state.page}
          limit={PAGE_SIZE}
          total={state.data.total}
          onPageChange={state.goToPage}
        />
      ) : null}
    </div>
  );
}
