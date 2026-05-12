'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import ProductList from './components/list/ProductList';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import SourcingHeader from './components/list/SourcingHeader';
import SourcingStats from './components/list/SourcingStats';
import SourcingToolbar from './components/list/SourcingToolbar';
import { useProcessingIds } from './hooks/useProcessingIds';
import { useScrapeUrl } from './hooks/useScrapeUrl';
import { isInProgress, productsApi, type SourcingSort } from './lib/sourcing-api';

export default function SourcingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<SourcingSort>('newest');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scrape = useScrapeUrl();

  const { data: productData, isLoading } = useQuery({
    queryKey: queryKeys.sourcing.list({ page: String(page), limit: String(pageSize), sort }),
    queryFn: () => productsApi.list({ page, limit: pageSize, sort }),
    // Phase 7 (#192): the list endpoint only returns `status='sourced'` rows;
    // poll while any row exists so post-promotion/rejected mutations refresh
    // the list state without explicit invalidation races.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((p) => isInProgress(p.status)) ? 10000 : false;
    },
  });

  const products = productData?.items ?? [];
  const total = productData?.total ?? 0;

  const { processingIds } = useProcessingIds(products);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onMutate: (id) => setDeletingId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '상품 삭제에 실패했습니다.'),
    onSettled: () => setDeletingId(null),
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <SourcingHeader />

      <SourcingStats
        draftCount={products.filter((p) => p.status === 'sourced').length}
        totalCount={total}
      />

      <SourcingToolbar
        showScrapeInput={scrape.showScrapeInput}
        onToggleScrapeInput={scrape.toggleScrapeInput}
        sort={sort}
        pageSize={pageSize}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {scrape.showScrapeInput && (
          <ScrapeUrlInput
            scrapeUrl={scrape.scrapeUrl}
            onChange={scrape.setScrapeUrl}
            onKeyDown={scrape.handleKeyDown}
            onSubmit={scrape.handleSubmit}
            onClose={scrape.resetInput}
            isPending={scrape.isPending}
            error={scrape.scrapeError}
            success={scrape.scrapeSuccess}
            inputRef={scrape.scrapeInputRef}
          />
        )}

        <ProductList
          isLoading={isLoading}
          products={products}
          processingIds={processingIds}
          deletingId={deletingId}
          onDelete={deleteMutation.mutate}
          onNavigate={(id) => router.push(`/sourcing/${id}`)}
        />

        <div className="mt-4">
          <Pagination page={page} limit={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
