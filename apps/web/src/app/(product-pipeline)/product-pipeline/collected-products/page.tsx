'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAllGenerationsInProgress } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  collectedProductDetailHref,
  collectedProductEditorHref,
} from '../_shared/lib/product-pipeline-routes';
import { GenerationProgressBannerStack } from './[id]/components/GenerationProgressBanner';
import ProductList from './components/list/ProductList';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import SourcingHeader from './components/list/SourcingHeader';
import SourcingStats from './components/list/SourcingStats';
import SourcingToolbar from './components/list/SourcingToolbar';
import { useProcessingIds } from './hooks/useProcessingIds';
import { useScrapeUrl } from './hooks/useScrapeUrl';
import {
  candidatesApi,
  isInProgress,
  productsApi,
  type SourcingSort,
} from './lib/sourcing-api';

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
    // 후보 inbox 는 sourced 상태가 작업 대상이다. 진행 중 AI 생성은 별도 배너 쿼리가 맡는다.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((p) => isInProgress(p.status)) ? 10000 : false;
    },
  });

  const products = productData?.items ?? [];
  const total = productData?.total ?? 0;

  const { processingIds } = useProcessingIds(products);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.delete(id),
    onMutate: (id) => setDeletingId(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.productContent.sourcingLinks(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations({ sourceCandidateId: id }) });
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : '소싱 후보 삭제에 실패했습니다.'),
    onSettled: () => setDeletingId(null),
  });

  const sourcedCount = products.filter((p) => p.status === 'sourced').length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <SourcingHeader />

      {/* productId 없이 호출 — Trend/KIDITEM 전체에서 진행 중인 첫 entry 반환 */}
      <GenerationInProgressBannerSlot products={products} />

      <SourcingStats
        draftLabel="등록 대기"
        totalLabel="전체 후보"
        draftCount={sourcedCount}
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
          onNavigate={(id) => router.push(collectedProductDetailHref(id))}
          onOpenEditor={(id) => router.push(collectedProductEditorHref({ candidateId: id }))}
        />

        <div className="mt-4">
          <Pagination page={page} limit={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

/**
 * 리스트 페이지 상단 진행 배너 슬롯.
 *
 * `useAllGenerationsInProgress(null)` 는 productId 필터 없이 Trend+KIDITEM 전체 list polling
 * → 진행 중인 모든 entry 반환 → 다건이면 stacked 배너로 모두 표시.
 */
function GenerationInProgressBannerSlot({
  products,
}: {
  products: Array<{ id: string; name: string }>;
}) {
  const inProgressEntries = useAllGenerationsInProgress(null);
  if (inProgressEntries.length === 0) return null;

  const entries = inProgressEntries.map((e) => {
    const product = e.productId ? products.find((p) => p.id === e.productId) : null;
    return {
      id: e.id,
      templateId: e.templateId,
      status: e.imageProcessingStatus,
      processedCount: Object.keys(e.processedImages || {}).length,
      totalCount: e.imageUrls?.length ?? 0,
      productName: product?.name ?? e.productName ?? '',
      rawInput: e.rawInput,
    };
  });

  return <GenerationProgressBannerStack entries={entries} />;
}
