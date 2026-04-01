'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../lib/sourcing-api';
import type { DetailPageData } from '@kiditem/templates';
import { getTemplate, parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { renderTemplateToHtml } from '../lib/template-html';
import MobilePreview from '../components/MobilePreview';
import ProductEditHeader from '../components/ProductEditHeader';
import ProductEditTabs, { type EditTabType } from '../components/ProductEditTabs';
import ProductLoadingView from './components/ProductLoadingView';
import ProductErrorView from './components/ProductErrorView';
import ProductTabContent from './components/ProductTabContent';
import {
  type ProductEditState,
  PLACEHOLDER_DATA,
  mapProcessedData,
} from './lib/types';

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

  const { data: fetchedData, isLoading: isLoadingProduct, error: queryError } = useQuery({
    queryKey: queryKeys.sourcing.detail(productId),
    queryFn: async () => {
      const [data, previewRes, css] = await Promise.all([
        productsApi.getDetail(productId),
        apiClient.get<{ template: string | null; data: Record<string, unknown> }>(`/api/products/${productId}/preview`)
          .catch(() => null),
        fetch('/templates-styles.css')
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ]);

      let detailPageData: DetailPageData = placeholderDetailPageData;
      if (previewRes?.template && previewRes?.data) {
        try {
          const parsed = parseDetailPageData(previewRes.data);
          const resolve = (url: string) => url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
          parsed.images = Array.isArray(parsed.images) ? parsed.images.map(resolve) : [];
          parsed.sizeImages = Array.isArray(parsed.sizeImages) ? parsed.sizeImages.map(resolve) : [];
          parsed.detailImages = Array.isArray(parsed.detailImages) ? parsed.detailImages.map(resolve) : [];
          if (parsed.heroBanner) parsed.heroBanner = resolve(parsed.heroBanner);
          detailPageData = parsed;
        } catch {
          // keep placeholder
        }
      }

      const editState = data.processed_data
        ? mapProcessedData(data.processed_data)
        : {
            ...PLACEHOLDER_DATA,
            name: data.name,
            salePrice: data.price_krw ?? 0,
            thumbnails: data.thumbnail_url ? [data.thumbnail_url] : [],
          };

      return { product: data, detailPageData, templateCss: css, editState };
    },
  });

  const product = fetchedData?.product ?? null;
  const detailPageData = fetchedData?.detailPageData ?? placeholderDetailPageData;
  const templateCss = fetchedData?.templateCss ?? '';
  const loadError = queryError ? (isApiError(queryError) ? queryError.detail : '상품 정보를 불러올 수 없습니다.') : null;

  if (fetchedData && !editInitialized) {
    setEditData(fetchedData.editState);
    setEditInitialized(true);
  }

  const updateField = <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const detailPreviewHtml = useMemo(() => {
    const config = getTemplate('bold-vertical');
    return renderTemplateToHtml(
      config.component as React.ComponentType<unknown>,
      detailPageData,
      config,
      templateCss,
    );
  }, [detailPageData, templateCss]);

  if (isLoadingProduct) {
    return <ProductLoadingView productId={productId} onBack={goBack} />;
  }

  if (loadError) {
    return (
      <ProductErrorView
        productId={productId}
        error={loadError}
        onBack={goBack}
        onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) })}
      />
    );
  }

  const nameLength = Array.from(editData.name).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProductEditHeader
        productName={editData.name || '(상품명 없음)'}
        productId={productId}
        isEditComplete={isEditComplete}
        isLocked={isLocked}
        onToggleEditComplete={() => setIsEditComplete((v) => !v)}
        onToggleLocked={() => setIsLocked((v) => !v)}
        onBack={goBack}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[65%] flex flex-col overflow-hidden border-r border-gray-200">
          <ProductEditTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <ProductTabContent
              activeTab={activeTab}
              editData={editData}
              updateField={updateField}
              nameLength={nameLength}
              productId={productId}
              detailPreviewHtml={detailPreviewHtml}
              rawData={product?.raw_data ?? null}
            />
          </div>
        </div>

        <div className="w-[35%] overflow-y-auto bg-gray-50/50 p-6">
          <MobilePreview
            name={editData.name}
            mainImage={editData.thumbnails[0] ?? 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image'}
            salePrice={editData.salePrice}
            originalPrice={editData.originalPrice}
            discountRate={editData.discountRate}
            rating={editData.rating}
            reviewCount={editData.reviewCount}
          />
        </div>
      </div>
    </div>
  );
}
