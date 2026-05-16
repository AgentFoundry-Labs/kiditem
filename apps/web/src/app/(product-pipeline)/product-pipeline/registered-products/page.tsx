'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ProductPipelineHeader } from '../_shared/components/inbox/ProductPipelineHeader';
import { ProductPipelineStats } from '../_shared/components/inbox/ProductPipelineStats';
import { ProductInboxListFrame } from '../_shared/components/inbox/ProductInboxListFrame';
import { ProductInboxToolbar } from '../_shared/components/inbox/ProductInboxToolbar';
import { registrationWorkspacesApi } from '../_shared/lib/registration-workspaces-api';
import { CreateRegistrationWorkspaceDialog } from './components/CreateRegistrationWorkspaceDialog';
import { RegisteredWorkspaceCard } from './components/RegisteredWorkspaceCard';
import { archiveRegistrationWorkspaces as archiveManyRegistrationWorkspaces } from './lib/registration-workspace-delete';
import {
  registrationWorkspaceDetailHref,
  registrationWorkspaceTitle,
} from './lib/registration-workspace-view';
import { registrationWorkspaceThumbnailGenerationHref } from './lib/registration-thumbnail-generation';

type RegisteredWorkspaceSort = 'newest' | 'oldest' | 'name_asc';
type RegisteredWorkspaceFilter = 'all';

export default function RegisteredProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<RegisteredWorkspaceSort>('newest');
  const [filter, setFilter] = useState<RegisteredWorkspaceFilter>('all');
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
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sort === 'oldest') return a.updatedAt.localeCompare(b.updatedAt);
      if (sort === 'name_asc') {
        return registrationWorkspaceTitle(a).localeCompare(registrationWorkspaceTitle(b), 'ko');
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items, sort]);
  const total = data?.total ?? 0;
  const visibleIds = sortedItems.map((item) => item.id);
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

      <ProductInboxToolbar
        tabs={[{ key: 'all', label: '전체 작업' }]}
        activeTab={filter}
        onTabChange={setFilter}
        sort={sort}
        sortOptions={[
          { value: 'newest', label: '최신순' },
          { value: 'oldest', label: '오래된순' },
          { value: 'name_asc', label: '상품명순' },
        ]}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pageSize={pageSize}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        actions={
          <>
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="flex h-7 items-center gap-1.5 rounded-md bg-emerald-500 px-3 font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Plus size={14} />
              등록 상품 추가
            </button>
            <button
              type="button"
              onClick={() => router.push('/product-pipeline/detail-template-generation')}
              className="h-7 rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300"
            >
              자체 수집 상세 생성
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ProductInboxListFrame
          isLoading={isLoading}
          isEmpty={sortedItems.length === 0}
          emptyState={{
            title: '등록 상품 작업이 없습니다.',
            description: '등록 상품을 추가하면 상세/썸네일 작업 이력이 여기에 모입니다.',
          }}
          selectionAction={{
            checked: allVisibleSelected,
            onChange: toggleVisibleSelection,
            deleteAction: {
              label: `선택 삭제${selectedCount > 0 ? ` ${selectedCount}` : ''}`,
              disabled: selectedCount === 0 || deleteMutation.isPending,
              onClick: () => deleteMutation.mutate([...selectedIds]),
            },
          }}
        >
          {sortedItems.map((workspace) => (
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
        </ProductInboxListFrame>

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
