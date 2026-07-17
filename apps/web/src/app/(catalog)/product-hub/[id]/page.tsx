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
import ProductHeader from './components/ProductHeader';
import ProductInfoCards from './components/ProductInfoCards';
import ProductVariantPanel from './components/ProductVariantPanel';

export default function ProductHubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editorOpen, setEditorOpen] = useState(false);
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
  const recipeVariantId = searchParams.get('recipeVariant') ?? undefined;
  const validRecipeVariantId = product.variants.some((variant) => variant.id === recipeVariantId)
    ? recipeVariantId
    : undefined;
  const closeRecipeDialog = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('recipeVariant');
    next.delete('recipeSearch');
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };

  return (
    <div className="space-y-6">
      <ProductHeader product={product} onEdit={() => setEditorOpen(true)} />
      <ProductInfoCards product={product} />
      <ProductVariantPanel
        variants={product.variants}
        recipeVariantId={validRecipeVariantId}
        initialInventorySearch={validRecipeVariantId ? searchParams.get('recipeSearch') ?? undefined : undefined}
        onRecipeDialogClose={closeRecipeDialog}
      />
      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => undefined}
        product={product}
      />
    </div>
  );
}
