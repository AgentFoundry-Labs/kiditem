'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { InventorySkuSnapshotItemSchema } from '@kiditem/shared/inventory';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ChannelSkuInventorySummary } from '../components/ChannelSkuInventorySummary';
import ProductHeader from './components/ProductHeader';
import ProductInfoCards from './components/ProductInfoCards';

export default function ProductHubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, error } = useQuery({
    queryKey: [...queryKeys.inventory.snapshots(), 'detail', id],
    queryFn: () => apiClient.getParsed(
      `/api/inventory/sellpia-skus/${id}`,
      InventorySkuSnapshotItemSchema,
    ),
    enabled: Boolean(id),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error || !product) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        {isApiError(error) && error.status === 404
          ? 'Sellpia 상품을 찾을 수 없습니다.'
          : 'Sellpia 상품 정보를 불러오지 못했습니다.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProductHeader product={product} />
      <ProductInfoCards product={product} />
      <ChannelSkuInventorySummary />
    </div>
  );
}
