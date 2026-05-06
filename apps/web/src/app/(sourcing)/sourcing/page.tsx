'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAllGenerationsInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { GenerationProgressBannerStack } from './[id]/components/GenerationProgressBanner';
import ProductList from './components/list/ProductList';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import SourcingHeader from './components/list/SourcingHeader';
import SourcingStats from './components/list/SourcingStats';
import SourcingToolbar from './components/list/SourcingToolbar';
import { useProcessingIds } from './hooks/useProcessingIds';
import { useScrapeUrl } from './hooks/useScrapeUrl';
import { isInProgress, productsApi } from './lib/sourcing-api';

const PAGE_SIZE = 50;

export default function SourcingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scrape = useScrapeUrl();

  const { data: productData, isLoading } = useQuery({
    queryKey: queryKeys.sourcing.list({ page: String(page) }),
    queryFn: () => productsApi.list({ page, limit: PAGE_SIZE }),
    // ContentAgent 가 한 단계 진행할 때마다 pipeline_step 갱신 → 3초 폴링으로 카드 자동 refresh.
    // 'processing' (Step1) / 'images_generating' (Step2) / 옛 'PROCESSING' 모두 트리거.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((p) => isInProgress(p.status)) ? 3000 : false;
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

      {/* productId 없이 호출 — Trend/KIDITEM 전체에서 진행 중인 첫 entry 반환 */}
      <GenerationInProgressBannerSlot products={products} />

      <SourcingStats
        draftCount={products.filter((p) => p.status === 'DRAFT' || p.status === 'draft').length}
        totalCount={products.length}
      />

      <SourcingToolbar
        showScrapeInput={scrape.showScrapeInput}
        onToggleScrapeInput={scrape.toggleScrapeInput}
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
          onOpenEditor={(id) => router.push(`/sourcing/${id}/editor`)}
        />

        <div className="mt-4">
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
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
    };
  });

  return <GenerationProgressBannerStack entries={entries} />;
}
