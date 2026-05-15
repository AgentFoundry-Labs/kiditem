'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ProductPipelineHeader } from '../_shared/components/inbox/ProductPipelineHeader';
import { ProductPipelineStats } from '../_shared/components/inbox/ProductPipelineStats';
import { registrationWorkspacesApi } from '../_shared/lib/registration-workspaces-api';
import { CreateRegistrationWorkspaceDialog } from './components/CreateRegistrationWorkspaceDialog';
import { RegisteredWorkspaceCard } from './components/RegisteredWorkspaceCard';
import { archiveRegistrationWorkspaces as archiveManyRegistrationWorkspaces } from './lib/registration-workspace-delete';
import {
  registrationWorkspaceDetailHref,
} from './lib/registration-workspace-view';
import { registrationWorkspaceThumbnailGenerationHref } from './lib/registration-thumbnail-generation';

export default function RegisteredProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.registrationWorkspaces.list({
      page: String(page),
      limit: String(pageSize),
    }),
    queryFn: () => registrationWorkspacesApi.list({ page, limit: pageSize }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      archiveManyRegistrationWorkspaces(ids, (id) => registrationWorkspacesApi.archive(id)),
    onMutate: (ids) => {
      setDeletingIds((prev) => new Set([...prev, ...ids]));
    },
    onSuccess: ({ succeededIds, failedIds }) => {
      if (succeededIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.registrationWorkspaces.all });
      if (failedIds.length > 0) {
        toast.error(`${failedIds.length}개 작업 삭제에 실패했습니다.`);
      } else if (succeededIds.length > 1) {
        toast.success(`${succeededIds.length}개 작업을 삭제했습니다.`);
      }
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : '등록 상품 작업 삭제에 실패했습니다.'),
    onSettled: (_data, _err, ids) => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => registrationWorkspacesApi.create({ title }),
    onSuccess: async (workspace) => {
      toast.success('등록 상품 작업 공간을 만들었습니다.');
      setCreateDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.registrationWorkspaces.all });
      router.push(registrationWorkspaceDetailHref(workspace));
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : '등록 상품 작업 공간 생성에 실패했습니다.'),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const visibleIds = items.map((item) => item.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedCount = selectedIds.size;

  const setItemSelected = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <ProductPipelineHeader
        title="등록 상품"
        subtitle="등록 작업 공간 · 상세/썸네일 생성 이력"
        searchPlaceholder="상품명 · 등록 작업 검색"
      />

      <ProductPipelineStats
        draftLabel="상세페이지 보유"
        totalLabel="전체 작업"
        draftCount={items.filter((workspace) => workspace.latestGenerationId).length}
        totalCount={total}
      />

      <div className="flex h-12 items-center justify-between gap-3 border-b border-slate-200 px-5">
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => toggleVisibleSelection(event.currentTarget.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-xs font-medium text-slate-500">전체 선택</span>
          </label>
          <button
            type="button"
            onClick={() => deleteMutation.mutate([...selectedIds])}
            disabled={selectedCount === 0 || deleteMutation.isPending}
            className={cn(
              'h-8 rounded-md border px-3 text-xs font-semibold transition-colors',
              selectedCount === 0 || deleteMutation.isPending
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50',
            )}
          >
            선택 삭제{selectedCount > 0 ? ` ${selectedCount}` : ''}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <Plus size={14} />
            등록 상품 추가
          </button>
          <button
            type="button"
            onClick={() => router.push('/product-pipeline/detail-template-generation')}
            className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            상세 템플릿 생성
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-[0.72] animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
              <AlertCircle size={24} className="text-slate-400" />
            </div>
            <p className="mb-2 text-lg font-bold text-slate-800">등록 상품 작업이 없습니다.</p>
            <p className="text-sm">등록 상품을 추가하거나 상세 템플릿을 생성하면 여기에 모입니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((workspace) => (
              <RegisteredWorkspaceCard
                key={workspace.id}
                workspace={workspace}
                isDeleting={deletingIds.has(workspace.id)}
                selected={selectedIds.has(workspace.id)}
                onOpen={(next) => router.push(registrationWorkspaceDetailHref(next))}
                onSelectedChange={setItemSelected}
                onOpenThumbnailEditor={(next) => router.push(registrationWorkspaceThumbnailGenerationHref(next))}
                onDelete={(id) => deleteMutation.mutate([id])}
              />
            ))}
          </div>
        )}

        <div className="mt-4">
          <Pagination page={page} limit={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>

      <CreateRegistrationWorkspaceDialog
        open={createDialogOpen}
        isSubmitting={createMutation.isPending}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={(title) => createMutation.mutate(title)}
      />
    </div>
  );
}
