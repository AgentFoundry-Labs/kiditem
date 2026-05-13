'use client';

import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Layers3, Plus, Sparkles } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, formatTime } from '@/lib/utils';
import { ProductContentGrid } from './components/ProductContentGrid';
import { productContentApi, type ProductContentAssetItem, type ProductContentWorkProductItem } from './lib/product-content-api';

const PAGE_SIZE = 20;
const ASSET_PAGE_SIZE = 24;
type ProductContentTab = 'work-products' | 'assets' | 'by-product';

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
  const activeTab = parseTab(searchParams.get('tab'));
  const productId = searchParams.get('productId');
  const [page, setPage] = useState(1);
  const [assetPage, setAssetPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.cards({ page: String(page), limit: String(PAGE_SIZE) }),
    queryFn: () => productContentApi.listCards({ page, limit: PAGE_SIZE }),
  });
  const { data: workProducts = [], isLoading: isWorkProductsLoading } = useQuery({
    queryKey: [...queryKeys.productContent.all, 'work-products'],
    queryFn: () => productContentApi.listWorkProducts(),
  });
  const { data: assets, isLoading: isAssetsLoading } = useQuery({
    queryKey: [
      ...queryKeys.productContent.all,
      'assets',
      { page: assetPage, limit: ASSET_PAGE_SIZE, productId },
    ],
    queryFn: () => productContentApi.listAssets({
      page: assetPage,
      limit: ASSET_PAGE_SIZE,
      productId,
    }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const assetItems = assets?.items ?? [];
  const assetTotal = assets?.total ?? 0;

  const setTab = (tab: ProductContentTab) => {
    setPage(1);
    setAssetPage(1);
    const qs = new URLSearchParams();
    if (tab !== 'work-products') qs.set('tab', tab);
    if (productId) qs.set('productId', productId);
    router.replace(qs.size > 0 ? `/product-content?${qs}` : '/product-content');
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)]">상품 콘텐츠 관리</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상세페이지 작업물과 이미지 자산을 만들고 상품에 연결합니다.
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
        <div className="mb-5 inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          <TabButton active={activeTab === 'work-products'} onClick={() => setTab('work-products')}>
            <Layers3 size={14} />
            작업물 {formatNumber(workProducts.length)}
          </TabButton>
          <TabButton active={activeTab === 'assets'} onClick={() => setTab('assets')}>
            <ImageIcon size={14} />
            이미지 {formatNumber(assetTotal)}
          </TabButton>
          <TabButton active={activeTab === 'by-product'} onClick={() => setTab('by-product')}>
            <Sparkles size={14} />
            상품별 {formatNumber(total)}
          </TabButton>
        </div>

        {activeTab === 'work-products' && (
          <WorkProductGrid items={workProducts} isLoading={isWorkProductsLoading} />
        )}

        {activeTab === 'assets' && (
          <>
            <AssetGrid items={assetItems} isLoading={isAssetsLoading} />
            <div className="mt-5">
              <Pagination
                page={assetPage}
                limit={ASSET_PAGE_SIZE}
                total={assetTotal}
                onPageChange={setAssetPage}
              />
            </div>
          </>
        )}

        {activeTab === 'by-product' && (
          <>
            <ProductContentGrid items={items} isLoading={isLoading} />
            <div className="mt-5">
              <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ProductContentPageFallback() {
  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)]">상품 콘텐츠 관리</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상세페이지 작업물과 이미지 자산을 만들고 상품에 연결합니다.
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
        <GridSkeleton />
      </main>
    </div>
  );
}

function parseTab(raw: string | null): ProductContentTab {
  if (raw === 'assets' || raw === 'by-product') return raw;
  return 'work-products';
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition',
        active
          ? 'bg-[var(--text-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
  );
}

function WorkProductGrid({
  items,
  isLoading,
}: {
  items: ProductContentWorkProductItem[];
  isLoading: boolean;
}) {
  if (isLoading) return <GridSkeleton />;
  if (items.length === 0) return <EmptyState label="아직 생성된 상세페이지 작업물이 없습니다." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const thumbnail = item.processedImages.__heroBanner ?? item.imageUrls[0] ?? null;
        return (
          <Link
            key={item.id}
            href={`/product-content/detail-pages/${item.id}/editor`}
            className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md"
          >
            <div className="aspect-[4/3] bg-[var(--surface-sunken)]">
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
                  <Sparkles size={32} />
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)]">
                  {item.templateId}
                </span>
                <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                  {formatTime(item.createdAt, { month: '2-digit', day: '2-digit' })}
                </span>
              </div>
              <h2 className="line-clamp-2 text-sm font-black text-[var(--text-primary)]">
                {item.productName || '상세페이지 작업물'}
              </h2>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                {item.productId ? '상품 연결됨' : '상품 미연결'} · {item.imageProcessingStatus}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function AssetGrid({
  items,
  isLoading,
}: {
  items: ProductContentAssetItem[];
  isLoading: boolean;
}) {
  if (isLoading) return <GridSkeleton />;
  if (items.length === 0) return <EmptyState label="아직 이미지 자산이 없습니다." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.id}
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm"
        >
          <div className="aspect-square bg-[var(--surface-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1 p-3">
            <p className="truncate text-xs font-black text-[var(--text-primary)]">
              {item.label ?? item.role ?? item.sourceType}
            </p>
            <p className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">
              {item.product?.name ?? '상품 미연결'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-64 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text-secondary)]">
      {label}
    </div>
  );
}
