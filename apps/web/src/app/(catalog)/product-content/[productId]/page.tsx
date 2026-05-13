'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { ProductContentGrid } from '../components/ProductContentGrid';
import { productContentApi } from '../lib/product-content-api';

export default function ProductContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.cards({ productId, page: '1', limit: '100' }),
    queryFn: () => productContentApi.listCards({ productId, page: 1, limit: 100 }),
    enabled: !!productId,
  });
  const items = data?.items ?? [];
  const productName = items[0]?.productName ?? '상품 콘텐츠';

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push('/product-content')}
              className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={14} />
              상품 콘텐츠 관리
            </button>
            <h1 className="truncate text-xl font-black text-[var(--text-primary)]">{productName}</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              이 상품에 연결된 상세페이지 생성 결과입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/generate?productId=${encodeURIComponent(productId)}`)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-sunken)]"
          >
            <ExternalLink size={15} />
            추가 생성
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <ProductContentGrid items={items} isLoading={isLoading} />
      </main>
    </div>
  );
}
