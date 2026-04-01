'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronDown,
  Edit3,
  Eye,
  Link as LinkIcon,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  productsApi,
  sourcingApi,
  type ProductListItem,
} from '@/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { isApiError } from '@/lib/api-error';
import StatusBadge from './components/StatusBadge';
import SkeletonCard from './components/SkeletonCard';
import { Pagination } from '@/components/ui/Pagination';
import { formatKRW } from '@/lib/utils';

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
      setScrapeError(
        err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      );
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
    onError: (err) => console.error('Failed to delete product:', err),
    onSettled: () => setDeletingId(null),
  });

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleProcess = async (
    id: string,
    generationMode?: string
  ) => {
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
      console.error('Failed to cancel processing:', err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 bg-white">
        <div className="flex items-baseline gap-4">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            수집상품
          </h1>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>수집 서버 속도</span>
            <span className="flex items-center gap-1 text-emerald-600 px-2 py-0.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              아주 원활
            </span>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="상품명 · 상품코드 · 메모 검색"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-white m-6 rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex gap-4 mb-6">
          <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-gray-600 font-medium text-sm">
              등록을 기다리는 상품{' '}
              <span className="font-extrabold text-gray-900 ml-1 text-base">
                {products.filter((p) => p.status === 'DRAFT').length}개
              </span>
            </span>
          </div>
          <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-gray-600 font-medium text-sm">
                전체 상품{' '}
                <span className="font-extrabold text-gray-900 ml-1 text-base">
                  {products.length}개
                </span>
              </span>
              {products.length > 0 && products[0].thumbnail_url && (
                <img
                  src={products[0].thumbnail_url}
                  alt="Thumb"
                  className="w-8 h-8 rounded border object-cover"
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 pb-4 border-b border-gray-100">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button className="px-4 py-1.5 text-sm font-bold bg-white text-gray-800 rounded shadow-sm">
              수집 목록
            </button>
            <button className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
              간단 편집
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="border border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm bg-white cursor-pointer hover:bg-gray-50 font-medium">
              최신순 <ChevronDown size={14} className="text-gray-500" />
            </div>
            <div className="border border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm bg-white cursor-pointer hover:bg-gray-50 font-medium">
              20개씩 보기 <ChevronDown size={14} className="text-gray-500" />
            </div>
            <button
              onClick={() => setShowScrapeInput(!showScrapeInput)}
              className="ml-2 border border-gray-300 bg-white px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              URL 수집
            </button>
            <button className="border border-gray-300 bg-white px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              엑셀 수집
            </button>
            <Link
              href="/generate"
              className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
            >
              상세페이지 일괄 생성
            </Link>
          </div>
        </div>

        {showScrapeInput && (
          <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex items-center gap-2">
              <LinkIcon size={16} className="text-gray-500" />
              <input
                ref={scrapeInputRef}
                type="text"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                onKeyDown={handleScrapeKeyDown}
                placeholder="1688.com 또는 alibaba.com 상품 URL 입력"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                disabled={scrapeMutation.isPending}
              />
              <button
                onClick={handleScrapeUrl}
                disabled={scrapeMutation.isPending || !scrapeUrl.trim()}
                className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {scrapeMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  '수집'
                )}
              </button>
              <button
                onClick={() => {
                  setShowScrapeInput(false);
                  setScrapeUrl('');
                  setScrapeError(null);
                  setScrapeSuccess(null);
                }}
                disabled={scrapeMutation.isPending}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {scrapeError && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {scrapeError}
              </div>
            )}
            {scrapeSuccess && (
              <div className="mt-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                {scrapeSuccess}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-500">전체 선택</span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-4">
              <AlertCircle size={24} className="text-gray-400" />
            </div>
            <p className="font-bold text-gray-800 text-lg mb-2">
              수집된 상품이 없습니다.
            </p>
            <p className="text-sm">
              URL 수집이나 상세페이지 생성을 통해 첫 상품을 등록해 보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => {
              const isProcessing =
                processingIds.has(product.id) ||
                product.status === 'PROCESSING';
              const isDeleting = deletingId === product.id;

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg transition-all group relative ${
                    isDeleting ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <div
                    className="aspect-[4/5] relative overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() =>
                      router.push(`/sourcing/${product.id}`)
                    }
                  >
                    {product.thumbnail_url ? (
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
                        No Image
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/sourcing/${product.id}/editor`);
                        }}
                        className="text-white font-bold py-3 px-6 rounded-full shadow-lg transform scale-95 group-hover:scale-100 transition-all flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600"
                      >
                        <Sparkles size={16} /> 에디터 열기
                      </button>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/80 p-3 pt-6 z-0 flex justify-between items-center text-white">
                      <StatusBadge status={product.status} />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] bg-blue-500/80 text-white px-1.5 py-0.5 rounded font-medium">
                          {product.source_platform}
                        </span>
                        <MoreVertical
                          size={16}
                          className="text-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50">
                    <span className="text-[10px] text-gray-500 block mb-1">
                      ID: {product.id.slice(0, 8)}...
                    </span>
                    <h3
                      className="text-sm font-bold text-gray-800 mb-3 line-clamp-1"
                      title={product.name}
                    >
                      {product.name}
                    </h3>

                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-500">판매가</span>
                      <span className="text-sm font-bold">
                        {product.price_krw != null ? `₩${formatKRW(product.price_krw)}` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-500">
                        원가 (CNY)
                      </span>
                      <span className="text-sm font-bold text-gray-600">
                        {product.cost_cny != null
                          ? `¥${product.cost_cny}`
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-gray-500">이미지</span>
                      <span className="text-sm font-medium text-gray-600">
                        {product.image_count}장
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/sourcing/${product.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
                      >
                        <Eye size={12} /> 상세
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={isDeleting}
                        className="flex items-center justify-center gap-1 py-2 px-3 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
