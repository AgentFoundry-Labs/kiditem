'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { ProductContentWorkspaceCard } from './components/ProductContentWorkspaceCard';
import {
  ProductContentWorkspaceFilters,
  type ProductContentWorkspaceFilterValue,
} from './components/ProductContentWorkspaceFilters';
import { productContentApi } from './lib/product-content-api';

const PAGE_SIZE = 24;

export default function ProductContentPage() {
  return (
    <Suspense fallback={<ProductContentPageFallback />}>
      <ProductContentWorkspace />
    </Suspense>
  );
}

function ProductContentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1') || 1);
  const filters: ProductContentWorkspaceFilterValue = {
    contentType: parseContentType(searchParams.get('contentType')),
    linkState: parseLinkState(searchParams.get('linkState')),
  };
  const params = {
    page,
    limit: PAGE_SIZE,
    contentType: filters.contentType,
    linkState: filters.linkState,
  };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.workspaces(toQueryKey(params)),
    queryFn: () => productContentApi.listWorkspaces(params),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const updateFilters = (next: ProductContentWorkspaceFilterValue) => {
    setPage(1);
    const qs = new URLSearchParams();
    if (next.contentType) qs.set('contentType', next.contentType);
    if (next.linkState) qs.set('linkState', next.linkState);
    router.replace(qs.size > 0 ? `/product-content?${qs}` : '/product-content');
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)]">상품 콘텐츠 관리</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상품 workspace와 미연결 AI 콘텐츠 workspace를 한곳에서 관리합니다.
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <ProductContentWorkspaceFilters value={filters} onChange={updateFilters} />
          <div className="text-sm font-black text-[var(--text-secondary)]">
            {formatNumber(total)} workspace
          </div>
        </div>
        <WorkspaceGrid items={items} isLoading={isLoading} />
        <div className="mt-5">
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={total}
            onPageChange={(next) => {
              setPage(next);
              const qs = new URLSearchParams(searchParams.toString());
              if (next > 1) qs.set('page', String(next));
              else qs.delete('page');
              router.replace(qs.size > 0 ? `/product-content?${qs}` : '/product-content');
            }}
          />
        </div>
      </main>
    </div>
  );
}

function WorkspaceGrid({
  items,
  isLoading,
}: {
  items: Awaited<ReturnType<typeof productContentApi.listWorkspaces>>['items'];
  isLoading: boolean;
}) {
  if (isLoading) return <GridSkeleton />;
  if (items.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          <Sparkles size={24} />
        </div>
        <p className="text-base font-black text-[var(--text-primary)]">생성된 콘텐츠 workspace가 없습니다.</p>
        <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
          상세페이지나 이미지를 생성하면 이곳에 workspace 카드가 생깁니다.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((item) => (
        <ProductContentWorkspaceCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ProductContentPageFallback() {
  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <h1 className="text-xl font-black text-[var(--text-primary)]">상품 콘텐츠 관리</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <GridSkeleton />
      </main>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

function parseContentType(raw: string | null): ProductContentWorkspaceFilterValue['contentType'] {
  if (raw === 'detail_page' || raw === 'image') return raw;
  return null;
}

function parseLinkState(raw: string | null): ProductContentWorkspaceFilterValue['linkState'] {
  if (raw === 'linked' || raw === 'unlinked') return raw;
  return null;
}

function toQueryKey(params: {
  page: number;
  limit: number;
  contentType: string | null;
  linkState: string | null;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter((entry): entry is [string, string | number] => entry[1] !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}
