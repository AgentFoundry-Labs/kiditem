'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Loader2, Package, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { ProductContentWorkspaceSections } from '../../components/ProductContentWorkspaceSections';
import { productContentApi, type ProductSearchItem } from '../../lib/product-content-api';

export default function ProductContentGroupPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const groupId = params.groupId as string;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.groupWorkspace(groupId, { page: '1', limit: '100' }),
    queryFn: () => productContentApi.listGroupWorkspace(groupId, { page: 1, limit: 100 }),
    enabled: !!groupId,
  });
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const attach = useMutation({
    mutationFn: () => {
      if (!selectedProduct) throw new Error('product required');
      return productContentApi.attachGroupToProduct(groupId, selectedProduct.id);
    },
    onSuccess: (_result) => {
      toast.success('상품 workspace로 연결했습니다.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all });
      if (selectedProduct) router.push(`/product-content/${selectedProduct.id}`);
    },
    onError: () => toast.error('상품 연결에 실패했습니다.'),
  });
  const workspace = data?.workspace;

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
              {workspace?.title ?? '미연결 콘텐츠 workspace'}
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              상세페이지 {formatNumber(workspace?.detailPageCount ?? 0)}개 · 이미지{' '}
              {formatNumber(workspace?.imageCount ?? 0)}개
            </p>
          </div>
          <div className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3 lg:w-[420px]">
            <AttachProductSearch
              selectedProduct={selectedProduct}
              onSelect={setSelectedProduct}
            />
            <button
              type="button"
              disabled={!selectedProduct || attach.isPending}
              onClick={() => attach.mutate()}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {attach.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              상품 workspace에 연결
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <GroupSkeleton />
        ) : data ? (
          <ProductContentWorkspaceSections generations={data.generations} />
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <Sparkles size={24} />
            </div>
            <p className="text-base font-black text-[var(--text-primary)]">미연결 workspace를 찾을 수 없습니다.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function AttachProductSearch({
  selectedProduct,
  onSelect,
}: {
  selectedProduct: ProductSearchItem | null;
  onSelect: (product: ProductSearchItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['product-content', 'attach-product-search', query],
    queryFn: () => productContentApi.searchProducts(query),
    enabled: query.trim().length >= 2,
  });
  const items = data?.items ?? [];

  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          value={selectedProduct ? selectedProduct.name : query}
          onChange={(event) => {
            onSelect(null);
            setQuery(event.target.value);
          }}
          placeholder="연결할 상품 검색"
          className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]"
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" />
        )}
      </div>
      {items.length > 0 && !selectedProduct && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item);
                setQuery('');
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[var(--surface-sunken)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                {item.thumbnailUrl ?? item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl ?? item.imageUrl ?? ''} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Package size={16} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--text-primary)]">
                  {item.name}
                </p>
                <p className="truncate text-xs font-semibold text-[var(--text-secondary)]">
                  {item.code ?? item.representativeSku ?? item.id.slice(0, 8)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}
