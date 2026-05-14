'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getTemplate, placeholderDetailPageData } from '@kiditem/templates';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import MobilePreview from '../components/detail/MobilePreview';
import ProductEditHeader from '../components/detail/ProductEditHeader';
import ProductEditTabs, { type EditTabType } from '../components/detail/ProductEditTabs';
import { renderTemplateToHtml } from '../lib/template-html';
import ProductErrorView from './components/ProductErrorView';
import ProductLoadingView from './components/ProductLoadingView';
import ProductTabContent from './components/ProductTabContent';
import { GenerationProgressBannerStack } from './components/GenerationProgressBanner';
import { useAllGenerationsInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { useProductDetail } from './hooks/useProductDetail';
import { useSourcingThumbnailGenerations } from './hooks/useGenerateSourcingThumbnail';
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
  /**
   * 사용자가 생성 이력 탭에서 선택해서 상세페이지 탭에 띄우려는 항목.
   * null = 자동 (이 product 의 최신 Trend/KIDITEM 이력 우선).
   * 한 번에 한 종류만 active — Trend / KIDITEM / Agent.
   */
  const [selectedKidsPlayfulId, setSelectedKidsPlayfulId] = useState<string | null>(null);
  const [selectedBoldVerticalId, setSelectedBoldVerticalId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const goBack = () => router.push('/sourcing');

  const { data: fetchedData, isLoading: isLoadingProduct, error: queryError } =
    useProductDetail(productId);

  const product = fetchedData?.product ?? null;
  const promotedMasterId =
    (product as { promoted_master_id?: string | null; promotedMasterId?: string | null } | null)
      ?.promoted_master_id ??
    (product as { promotedMasterId?: string | null } | null)?.promotedMasterId ??
    null;
  const detailPageData = fetchedData?.detailPageData ?? placeholderDetailPageData;
  const editedHtml = fetchedData?.editedHtml ?? null;
  const templateCss = fetchedData?.templateCss ?? '';
  const inProgressEntries = useAllGenerationsInProgress(productId);
  const thumbnailGenerations = useSourcingThumbnailGenerations(productId);
  const selectedThumbnailGenerationCandidateId = useMemo(() => {
    const selectedUrl = editData.thumbnails[0];
    if (!selectedUrl) return null;
    for (const generation of thumbnailGenerations.data ?? []) {
      const candidate = generation.candidates.find((item) => item.url === selectedUrl);
      if (candidate?.id) return candidate.id;
    }
    return null;
  }, [editData.thumbnails, thumbnailGenerations.data]);
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
        selectedThumbnailUrl={editData.thumbnails[0] ?? product?.thumbnail_url ?? null}
        selectedThumbnailGenerationCandidateId={selectedThumbnailGenerationCandidateId}
        selectedDetailPageGenerationId={selectedAgentId}
        onToggleEditComplete={() => setIsEditComplete((v) => !v)}
        onToggleLocked={() => setIsLocked((v) => !v)}
        onBack={goBack}
        rawData={product?.raw_data ?? null}
        imageUrls={product?.image_urls ?? []}
      />

      {inProgressEntries.length > 0 && (
        <GenerationProgressBannerStack
          entries={inProgressEntries.map((e) => ({
            id: e.id,
            templateId: e.templateId,
            status: e.imageProcessingStatus,
            processedCount: Object.keys(e.processedImages || {}).length,
            totalCount: e.imageUrls?.length ?? 0,
            // detail 페이지는 product 단일이라 productName 생략 — 헤더에 이미 표시
          }))}
        />
      )}

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
              promotedMasterId={promotedMasterId}
              detailPreviewHtml={detailPreviewHtml}
              editedHtml={editedHtml}
              templateCss={templateCss}
              rawData={product?.raw_data ?? null}
              imageUrls={product?.image_urls ?? []}
              thumbnailUrl={product?.thumbnail_url ?? null}
              selectedKidsPlayfulId={selectedKidsPlayfulId}
              selectedBoldVerticalId={selectedBoldVerticalId}
              selectedAgentId={selectedAgentId}
              onSelectKidsPlayful={(id) => {
                setSelectedKidsPlayfulId(id);
                if (id) {
                  setSelectedBoldVerticalId(null);
                  setSelectedAgentId(null);
                }
                setActiveTab('detail');
              }}
              onSelectBoldVertical={(id) => {
                setSelectedBoldVerticalId(id);
                if (id) {
                  setSelectedKidsPlayfulId(null);
                  setSelectedAgentId(null);
                }
                setActiveTab('detail');
              }}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                if (id) {
                  setSelectedKidsPlayfulId(null);
                  setSelectedBoldVerticalId(null);
                }
                setActiveTab('detail');
              }}
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
