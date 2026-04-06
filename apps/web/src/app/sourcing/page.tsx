'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, sourcingApi } from './lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { Pagination } from '@/components/ui/Pagination';
import SourcingHeader from './components/list/SourcingHeader';
import SourcingStats from './components/list/SourcingStats';
import SourcingToolbar from './components/list/SourcingToolbar';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import ProductList from './components/list/ProductList';

export default function SourcingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showScrapeInput, setShowScrapeInput] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const scrapeInputRef = useRef<HTMLInputElement>(null);

  const hasProcessing = processingIds.size > 0;

  const { data: productData, isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.sourcing.list({ page: String(page) }),
    queryFn: () => productsApi.list({ page, limit: PAGE_SIZE }),
    refetchInterval: hasProcessing ? 3000 : false,
  });

  const products = productData?.items ?? [];
  const total = productData?.total ?? 0;
  const error = queryError ? (isApiError(queryError) ? queryError.detail : '소싱 상품을 불러오는데 실패했습니다.') : null;

  // processing 완료된 항목 자동 해제
  useEffect(() => {
    setProcessingIds((prev) => {
      if (prev.size === 0) return prev;
      const productMap = new Map(products.map((p) => [p.id, p]));
      const next = new Set(prev);
      let changed = false;
      Array.from(prev).forEach((id) => {
        const product = productMap.get(id);
        if (product && product.status !== 'PROCESSING') {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [products]);

  useEffect(() => {
    if (showScrapeInput && scrapeInputRef.current) {
      scrapeInputRef.current.focus();
    }
  }, [showScrapeInput]);

  const scrapeMutation = useMutation({
    mutationFn: (url: string) => sourcingApi.scrapeUrl(url),
    onSuccess: (response) => {
      setScrapeSuccess(response.message);
      setScrapeUrl('');
      setTimeout(() => {
        setShowScrapeInput(false);
        setScrapeSuccess(null);
      }, 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
    },
    onError: (err) => {
      setScrapeError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setTimeout(() => setScrapeError(null), 3000);
    },
  });

  const handleScrapeUrl = () => {
    if (!scrapeUrl.trim()) return;
    setScrapeError(null);
    setScrapeSuccess(null);
    scrapeMutation.mutate(scrapeUrl.trim());
  };

  const handleScrapeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !scrapeMutation.isPending) {
      handleScrapeUrl();
    } else if (e.key === 'Escape') {
      setShowScrapeInput(false);
      setScrapeUrl('');
      setScrapeError(null);
      setScrapeSuccess(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onMutate: (id) => setDeletingId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '상품 삭제에 실패했습니다.'),
    onSettled: () => setDeletingId(null),
  });

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleProcess = async (id: string, generationMode?: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await productsApi.process(id, { generation_mode: generationMode });
    } catch {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await productsApi.cancel(id);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '가공 취소에 실패했습니다.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <SourcingHeader />

      <div className="flex-1 overflow-y-auto bg-white m-6 rounded-xl border border-slate-200 p-6 shadow-sm">
        <SourcingStats
          draftCount={products.filter((p) => p.status === 'DRAFT').length}
          totalCount={products.length}
          firstThumbnailUrl={products[0]?.thumbnail_url}
        />

        <SourcingToolbar
          showScrapeInput={showScrapeInput}
          onToggleScrapeInput={() => setShowScrapeInput(!showScrapeInput)}
        />

        {showScrapeInput && (
          <ScrapeUrlInput
            scrapeUrl={scrapeUrl}
            onChange={setScrapeUrl}
            onKeyDown={handleScrapeKeyDown}
            onSubmit={handleScrapeUrl}
            onClose={() => { setShowScrapeInput(false); setScrapeUrl(''); setScrapeError(null); setScrapeSuccess(null); }}
            isPending={scrapeMutation.isPending}
            error={scrapeError}
            success={scrapeSuccess}
            inputRef={scrapeInputRef}
          />
        )}

        <ProductList
          isLoading={isLoading}
          products={products}
          processingIds={processingIds}
          deletingId={deletingId}
          onDelete={handleDelete}
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
