'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import MobilePreview from '../components/detail/MobilePreview';
import ProductEditHeader from '../components/detail/ProductEditHeader';
import ProductEditTabs, { type EditTabType } from '../components/detail/ProductEditTabs';
import ProductErrorView from './components/ProductErrorView';
import ProductLoadingView from './components/ProductLoadingView';
import ProductTabContent from './components/ProductTabContent';
import { useProductDetail } from './hooks/useProductDetail';
import { PLACEHOLDER_DATA, type ProductEditState } from './lib/types';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const productId = params.id as string;

  const [activeTab, setActiveTab] = useState<EditTabType>('basic');
  const [isEditComplete, setIsEditComplete] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [editData, setEditData] = useState<ProductEditState>(PLACEHOLDER_DATA);
  const [editInitialized, setEditInitialized] = useState(false);

  const goBack = () => router.push('/sourcing');

  const { data: fetchedData, isLoading: isLoadingProduct, error: queryError } =
    useProductDetail(productId);

  const product = fetchedData?.product ?? null;
  const promotedMasterId =
    (product as { promoted_master_id?: string | null; promotedMasterId?: string | null } | null)
      ?.promoted_master_id ??
    (product as { promotedMasterId?: string | null } | null)?.promotedMasterId ??
    null;
  const loadError = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '상품 정보를 불러올 수 없습니다.'
    : null;

  if (fetchedData && !editInitialized) {
    setEditData(fetchedData.editState);
    setEditInitialized(true);
  }

  const updateField = <K extends keyof ProductEditState>(
    field: K,
    value: ProductEditState[K],
  ) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoadingProduct) {
    return <ProductLoadingView productId={productId} onBack={goBack} />;
  }

  if (loadError) {
    return (
      <ProductErrorView
        productId={productId}
        error={loadError}
        onBack={goBack}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) })
        }
      />
    );
  }

  const nameLength = Array.from(editData.name).length;
  const usesWideContent = activeTab === 'detail' || activeTab === 'history';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProductEditHeader
        productName={editData.name || '(상품명 없음)'}
        productId={productId}
        status={product?.status}
        promotedMasterId={promotedMasterId}
        isEditComplete={isEditComplete}
        isLocked={isLocked}
        onToggleEditComplete={() => setIsEditComplete((v) => !v)}
        onToggleLocked={() => setIsLocked((v) => !v)}
        onBack={goBack}
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex flex-col overflow-hidden ${
            usesWideContent ? 'w-full' : 'w-[72%] border-r border-slate-200'
          }`}
        >
          <ProductEditTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <ProductTabContent
              activeTab={activeTab}
              editData={editData}
              updateField={updateField}
              nameLength={nameLength}
              productId={productId}
              rawData={product?.raw_data ?? null}
              imageUrls={product?.image_urls ?? []}
              thumbnailUrl={product?.thumbnail_url ?? null}
              promotedMasterId={promotedMasterId}
            />
          </div>
        </div>

        {!usesWideContent && (
          <div className="w-[28%] overflow-y-auto bg-slate-50/50 p-5">
            <MobilePreview
              name={editData.name}
              mainImage={
                editData.thumbnails[0] ?? 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image'
              }
              salePrice={editData.salePrice}
              originalPrice={editData.originalPrice}
              discountRate={editData.discountRate}
              rating={editData.rating}
              reviewCount={editData.reviewCount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
