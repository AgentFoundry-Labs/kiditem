'use client';

import { useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MasterProductOperationsDetailSchema } from '@kiditem/shared/product-operations';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ProductEditorDialog } from '../components/ProductEditorDialog';
import { ProductAbcDetailDialog } from '../components/ProductAbcDetailDialog';
import ProductHeader from './components/ProductHeader';
import ProductInfoCards from './components/ProductInfoCards';
import ChannelOptionInventoryPanel from './components/ChannelOptionInventoryPanel';

export default function ProductHubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editorOpen, setEditorOpen] = useState(false);
  const [abcDetailOpen, setAbcDetailOpen] = useState(false);
  const { data: product, isLoading, error } = useQuery({
    queryKey: queryKeys.products.operations.detail(id),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters/${id}`,
      MasterProductOperationsDetailSchema,
    ),
    enabled: Boolean(id),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error || !product) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        {isApiError(error) && error.status === 404
          ? '상품을 찾을 수 없습니다.'
          : '상품 정보를 불러오지 못했습니다.'}
      </div>
    );
  }
  const inventoryOptionId = searchParams.get('inventoryOption') ?? undefined;
  const validInventoryOptionId = product.channelListings
    .flatMap(({ options }) => options)
    .some((option) => option.id === inventoryOptionId)
    ? inventoryOptionId
    : undefined;
  const closeRecipeDialog = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('inventoryOption');
    next.delete('recipeSearch');
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };
  const returnToPreviousScreen = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace('/product-hub');
  };

  return (
    <div className="space-y-6">
      <ProductHeader
        product={product}
        onBack={returnToPreviousScreen}
        onEdit={() => setEditorOpen(true)}
      />
      <ProductInfoCards product={product} onOpenAbcDetail={() => setAbcDetailOpen(true)} />
      <ChannelOptionInventoryPanel
        channelListings={product.channelListings}
        inventoryOptionId={validInventoryOptionId}
        initialInventorySearch={validInventoryOptionId ? searchParams.get('recipeSearch') ?? undefined : undefined}
        onInventoryDialogClose={closeRecipeDialog}
      />
      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => undefined}
        product={product}
      />
      <ProductAbcDetailDialog
        open={abcDetailOpen}
        onOpenChange={setAbcDetailOpen}
        product={product}
        showProductLink={false}
      />
    </div>
  );
}
