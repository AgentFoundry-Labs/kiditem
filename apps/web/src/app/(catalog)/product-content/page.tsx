'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { ProductContentGrid } from './components/ProductContentGrid';
import { productContentApi } from './lib/product-content-api';

const PAGE_SIZE = 20;

export default function ProductContentPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.cards({ page: String(page), limit: String(PAGE_SIZE) }),
    queryFn: () => productContentApi.listCards({ page, limit: PAGE_SIZE }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)]">상품 콘텐츠 관리</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상세페이지 생성 결과와 저장된 편집본을 상품 기준으로 관리합니다.
            </p>
          </div>
          <Link
            href="/generate"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus size={16} />
            상세페이지 생성
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-black text-[var(--text-primary)]">
            <Sparkles size={16} className="text-[var(--primary)]" />
            콘텐츠 카드 {formatNumber(total)}개
          </div>
        </div>
        <ProductContentGrid items={items} isLoading={isLoading} />
        <div className="mt-5">
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </main>
    </div>
  );
}
