'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Package } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { ProductContentWorkspaceSections } from '../components/ProductContentWorkspaceSections';
import { productContentApi } from '../lib/product-content-api';

export default function ProductContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.productWorkspace(productId, { page: '1', limit: '100' }),
    queryFn: () => productContentApi.listProductWorkspace(productId, { page: 1, limit: 100 }),
    enabled: !!productId,
  });
  const workspace = data?.workspace;
  const productName = workspace?.product?.name ?? workspace?.title ?? '상품 콘텐츠';

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
            <h1 className="truncate text-xl font-black text-[var(--text-primary)]">
              {productName}
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상세페이지 {formatNumber(workspace?.detailPageCount ?? 0)}개 · 이미지{' '}
              {formatNumber(workspace?.imageCount ?? 0)}개
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
        {isLoading ? (
          <DetailSkeleton />
        ) : data ? (
          <ProductContentWorkspaceSections generations={data.generations} />
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <Package size={24} />
            </div>
            <p className="text-base font-black text-[var(--text-primary)]">상품 workspace를 찾을 수 없습니다.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <section key={sectionIndex}>
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-[var(--surface)]" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="h-32 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
