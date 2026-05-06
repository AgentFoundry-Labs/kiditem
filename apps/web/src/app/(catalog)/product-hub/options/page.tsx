'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchProductOptionList,
  productOptionListKeyParams,
  restoreProductOption,
  softDeleteProductOption,
  updateProductOption,
  type ProductOptionEditableFields,
  type ProductOptionListParams,
} from '@/app/(catalog)/products/options/lib/product-options-api';
import ProductOptionFilters, {
  type ProductOptionFilterState,
} from '@/app/(catalog)/products/options/components/ProductOptionFilters';
import ProductOptionTable from '@/app/(catalog)/products/options/components/ProductOptionTable';
import ProductOptionEditModal from '@/app/(catalog)/products/options/components/ProductOptionEditModal';
import type { ProductOption } from '@kiditem/shared/product';

const PAGE_LIMIT = 100;

function buildListParams(state: ProductOptionFilterState): ProductOptionListParams {
  const params: ProductOptionListParams = { limit: PAGE_LIMIT };
  if (state.search) params.search = state.search;
  if (state.bundleScope === 'bundle') params.isBundle = true;
  if (state.bundleScope === 'simple') params.isBundle = false;
  if (state.activeScope === 'active') params.isActive = true;
  if (state.activeScope === 'inactive') params.isActive = false;
  if (state.temporaryOnly) params.isTemporary = true;
  if (state.includeDeleted) params.includeDeleted = true;
  return params;
}

function describeApiError(err: unknown): string {
  if (isApiError(err)) return err.detail || err.message;
  if (err instanceof Error) return err.message;
  return '알 수 없는 오류가 발생했습니다.';
}

export default function ProductHubOptionsPage() {
  const queryClient = useQueryClient();
  const [filterState, setFilterState] = useState<ProductOptionFilterState>({
    search: '',
    bundleScope: 'all',
    activeScope: 'active',
    temporaryOnly: false,
    includeDeleted: false,
  });
  const [draftSearch, setDraftSearch] = useState('');
  const [editing, setEditing] = useState<ProductOption | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const listParams = useMemo(() => buildListParams(filterState), [filterState]);
  const queryKey = queryKeys.productOptions.list(productOptionListKeyParams(listParams));

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchProductOptionList(listParams),
  });

  const items = data?.items ?? [];
  const showLoading = isLoading && !data;

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.productOptions.all });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductOptionEditableFields }) =>
      updateProductOption(id, patch),
    onSuccess: () => {
      invalidateList();
      setEditing(null);
      setEditError(null);
      toast.success('옵션을 저장했어요.');
    },
    onError: (err) => {
      setEditError(describeApiError(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteProductOption(id),
    onSuccess: () => {
      invalidateList();
      toast.success('옵션을 삭제했어요. (soft-delete)');
    },
    onError: (err) => {
      toast.error(describeApiError(err));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreProductOption(id),
    onSuccess: () => {
      invalidateList();
      toast.success('옵션을 복원했어요.');
    },
    onError: (err) => {
      toast.error(describeApiError(err));
    },
  });

  const handleSoftDelete = (item: ProductOption) => {
    const ok = window.confirm(`옵션 "${item.optionName ?? item.sku}" 을(를) 삭제할까요? (soft-delete)`);
    if (!ok) return;
    deleteMutation.mutate(item.id);
  };

  const handleRestore = (item: ProductOption) => {
    restoreMutation.mutate(item.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
            <Layers size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              상품 옵션 관리
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              ProductOption 단위 — 상품명 / SKU / 옵션명 / 판매자 상품코드 / 활성·삭제 관리
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      <ProductOptionFilters
        draftSearch={draftSearch}
        state={filterState}
        onSearchInputChange={setDraftSearch}
        onSearchSubmit={() => setFilterState((prev) => ({ ...prev, search: draftSearch.trim() }))}
        onChange={(next) => setFilterState((prev) => ({ ...prev, ...next }))}
      />

      <div className="px-1 text-xs text-slate-500">
        {showLoading
          ? '불러오는 중...'
          : `${items.length}개 표시${data?.nextCursor ? ' (추가 페이지 있음 — 필터로 좁히세요)' : ''}`}
      </div>

      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          옵션 목록을 불러오지 못했어요. {describeApiError(error)}
        </div>
      ) : (
        <ProductOptionTable
          items={items}
          isLoading={showLoading}
          onEdit={(item) => {
            setEditing(item);
            setEditError(null);
          }}
          onSoftDelete={handleSoftDelete}
          onRestore={handleRestore}
        />
      )}

      {editing && (
        <ProductOptionEditModal
          option={editing}
          saving={updateMutation.isPending}
          errorMessage={editError}
          onClose={() => {
            setEditing(null);
            setEditError(null);
          }}
          onSave={(patch) => updateMutation.mutate({ id: editing.id, patch })}
        />
      )}
    </div>
  );
}
