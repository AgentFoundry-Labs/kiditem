'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTemplate, placeholderDetailPageData } from '@kiditem/templates';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useAllGenerationsInProgress,
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationCancel,
  useKidsPlayfulGenerationList,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import {
  ensureStyledDetailHtml,
  isRenderableDetailHtml,
  renderTemplateToHtml,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import {
  buildDetailGenerationEntryHtml,
  buildGenerationHistoryHtml,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/generated-detail-html';
import {
  selectedThumbnailGenerationCandidateId as resolveSelectedThumbnailGenerationCandidateId,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';
import {
  candidatesApi,
  type UpdateProductBasicsInput,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { useSourcingThumbnailGenerations } from '../../hooks/useGenerateSourcingThumbnail';
import { useProductDetail } from '../../hooks/useProductDetail';
import { PLACEHOLDER_DATA, type ProductEditState } from '../../lib/product-workspace-types';
import {
  buildProductWorkspaceTabUrl,
  parseProductWorkspaceTab,
} from '../../lib/product-workspace-tabs';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import { extractKcCertificationNumber } from '../../lib/kc-autofill';
import { buildProductRegistrationPreviewData } from './preview/product-registration-preview';
import { GenerationProgressBannerStack } from './GenerationProgressBanner';
import ProductErrorView from './ProductErrorView';
import ProductLoadingView from './ProductLoadingView';
import ProductTabContent from './ProductTabContent';
import { buildDetailGenerationRows } from './detail/detail-generation-rows';
import ProductEditTabs, { type EditTabType } from './detail/ProductEditTabs';
import ProductEditHeader from './detail/ProductEditHeader';
import MobilePreview from './preview/MobilePreview';
import type { ProductWorkspaceData } from '../../hooks/useProductDetail';
import type { GenerationHistoryItem } from '../../hooks/useGenerationHistory';

interface ProductWorkspaceScreenProps {
  productId: string;
  backHref: string;
  selfHref: string;
  initialAgentHistory?: GenerationHistoryItem[];
  initialWorkspaceData?: ProductWorkspaceData;
  generationHistoryQueryEnabled?: boolean;
  showCandidateActions?: boolean;
  contentWorkspaceId?: string | null;
  hasSavedDetailPage?: boolean;
  savedDetailPageGenerationId?: string | null;
  thumbnailSourceCandidateId?: string | null;
  onOpenDetailTemplateGeneration?: () => void;
}

export function ProductWorkspaceScreen({
  productId,
  backHref,
  selfHref,
  initialAgentHistory,
  initialWorkspaceData,
  generationHistoryQueryEnabled = true,
  showCandidateActions = true,
  contentWorkspaceId = null,
  hasSavedDetailPage,
  savedDetailPageGenerationId = null,
  thumbnailSourceCandidateId,
  onOpenDetailTemplateGeneration,
}: ProductWorkspaceScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const cancelDetailGeneration = useKidsPlayfulGenerationCancel();
  const queryTab = parseProductWorkspaceTab(searchParams.get('tab'));

  const [activeTab, setActiveTab] = useState<EditTabType>(queryTab);
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
  const [selectedRegistrationThumbnailUrl, setSelectedRegistrationThumbnailUrl] = useState<string | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [thumbnailPreviewImages, setThumbnailPreviewImages] = useState<string[]>([]);
  const [detailWorkspacePreviewHtml, setDetailWorkspacePreviewHtml] = useState<string | null>(null);

  const goBack = () => router.push(backHref);

  useEffect(() => {
    setActiveTab(queryTab);
  }, [queryTab]);

  const handleTabChange = (tab: EditTabType) => {
    setActiveTab(tab);
    router.replace(
      buildProductWorkspaceTabUrl({
        pathname,
        currentSearch: searchParams,
        tab,
      }),
      { scroll: false },
    );
  };

  const productDetailQuery =
    useProductDetail(productId, { enabled: !initialWorkspaceData });
  const fetchedData = initialWorkspaceData ?? productDetailQuery.data;
  const isLoadingProduct = !initialWorkspaceData && productDetailQuery.isLoading;
  const queryError = initialWorkspaceData ? null : productDetailQuery.error;

  const product = fetchedData?.product ?? null;
  const promotedMasterId =
    (product as { promoted_master_id?: string | null; promotedMasterId?: string | null } | null)
      ?.promoted_master_id ??
    (product as { promotedMasterId?: string | null } | null)?.promotedMasterId ??
    null;
  const detailGenerationProductId = promotedMasterId ?? productId;
  const detailGenerationContentWorkspaceId = contentWorkspaceId ?? null;
  const detailGenerationSourceCandidateId =
    detailGenerationContentWorkspaceId || promotedMasterId ? null : productId;
  const productPreparation = product?.productPreparation ?? null;
  const [basicPreparationBaseUpdatedAt, setBasicPreparationBaseUpdatedAt] =
    useState<string | null | undefined>(undefined);
  useEffect(() => {
    setBasicPreparationBaseUpdatedAt(productPreparation?.updatedAt ?? null);
  }, [productPreparation?.updatedAt]);
  const effectiveContentWorkspaceId =
    contentWorkspaceId ?? productPreparation?.contentWorkspaceId ?? null;
  const effectiveSavedDetailPageGenerationId =
    savedDetailPageGenerationId ?? productPreparation?.selectedDetailPageGenerationId ?? null;
  const detailPageData = fetchedData?.detailPageData ?? placeholderDetailPageData;
  const editedHtml = fetchedData?.editedHtml ?? null;
  const { data: fallbackTemplateCss = '' } = useQuery({
    queryKey: ['template-styles-css'],
    queryFn: () =>
      fetch('/templates-styles.css')
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => ''),
    enabled: !(fetchedData?.templateCss),
    staleTime: 300_000,
  });
  const templateCss = fetchedData?.templateCss || fallbackTemplateCss;
  const inProgressEntries = useAllGenerationsInProgress(detailGenerationProductId, {
    enabled: generationHistoryQueryEnabled,
    sourceCandidateId: detailGenerationSourceCandidateId,
    contentWorkspaceId: detailGenerationContentWorkspaceId,
  });
  const { data: agentHistory = [] } = useGenerationHistory(
    productId,
    initialAgentHistory,
    { enabled: generationHistoryQueryEnabled },
  );
  const { data: kidsPlayfulEntries = [] } = useKidsPlayfulGenerationList(detailGenerationProductId, {
    enabled: generationHistoryQueryEnabled,
    sourceCandidateId: detailGenerationSourceCandidateId,
    contentWorkspaceId: detailGenerationContentWorkspaceId,
  });
  const { data: boldEntries = [] } = useBoldVerticalGenerationList(detailGenerationProductId, {
    enabled: generationHistoryQueryEnabled,
    sourceCandidateId: detailGenerationSourceCandidateId,
    contentWorkspaceId: detailGenerationContentWorkspaceId,
  });
  const { data: selectedDetailEditedHtml } = useQuery({
    queryKey: effectiveSavedDetailPageGenerationId
      ? queryKeys.productContent.generationEditedHtml(effectiveSavedDetailPageGenerationId)
      : queryKeys.productContent.generationEditedHtml(''),
    queryFn: () => {
      if (!effectiveSavedDetailPageGenerationId) {
        throw new Error('detail page generation id is required');
      }
      return apiClient.get<{ html: string | null; savedAt: string | null }>(
        `/api/ai/detail-page/${effectiveSavedDetailPageGenerationId}/edited-html`,
      );
    },
    enabled: !!effectiveSavedDetailPageGenerationId,
    staleTime: 30_000,
  });
  const effectiveThumbnailSourceCandidateId =
    thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId;
  const selectionCandidateId =
    thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId;
  const thumbnailGenerations = useSourcingThumbnailGenerations({
    sourceCandidateId: effectiveThumbnailSourceCandidateId,
    contentWorkspaceId: effectiveContentWorkspaceId,
  });
  const selectedThumbnailGenerationCandidateId = useMemo(() => {
    return resolveSelectedThumbnailGenerationCandidateId(
      selectedRegistrationThumbnailUrl,
      thumbnailGenerations.data ?? [],
    );
  }, [selectedRegistrationThumbnailUrl, thumbnailGenerations.data]);
  const loadError = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '상품 정보를 불러올 수 없습니다.'
    : null;

  const selectThumbnailMutation = useMutation({
    mutationFn: (option: RegistrationThumbnailOption) => {
      if (!selectionCandidateId) return Promise.resolve(null);
      return candidatesApi.selectThumbnail(selectionCandidateId, {
        selectedThumbnailUrl: option.url,
        selectedThumbnailGenerationCandidateId: option.generatedCandidateId ?? null,
      });
    },
    onSuccess: () => {
      if (selectionCandidateId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(selectionCandidateId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      }
    },
  });

  const updateBasicInfoMutation = useMutation({
    mutationFn: (input: UpdateProductBasicsInput) => {
      if (!selectionCandidateId) return Promise.resolve(null);
      return candidatesApi.updateBasicInfo(selectionCandidateId, input);
    },
    onSuccess: () => {
      if (selectionCandidateId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(selectionCandidateId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      }
    },
  });

  const handleCommitBasicInfo = async (input: UpdateProductBasicsInput) => {
    if (!selectionCandidateId) return;
    const basePreparationUpdatedAt =
      basicPreparationBaseUpdatedAt === undefined
        ? productPreparation?.updatedAt ?? null
        : basicPreparationBaseUpdatedAt;
    const updated = await updateBasicInfoMutation.mutateAsync({
      ...input,
      basePreparationUpdatedAt,
    });
    setBasicPreparationBaseUpdatedAt(updated?.updatedAt ?? null);
  };

  const kcAutoFilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectionCandidateId) return;
    const basicInfo = fetchedData?.product?.basicInfo;
    if (!basicInfo) return;
    const status = basicInfo.kcCertificationStatus;
    if (status === 'exists' || status === 'none') return;

    const kcNumber = extractKcCertificationNumber([...kidsPlayfulEntries, ...boldEntries]);
    if (!kcNumber) return;
    if (kcAutoFilledRef.current === kcNumber) return;
    kcAutoFilledRef.current = kcNumber;

    updateBasicInfoMutation.mutate(
      { kcCertificationStatus: 'exists', kcCertificationNumber: kcNumber },
      {
        onSuccess: () => {
          toast.success(`이미지에서 KC 인증번호 ${kcNumber} 를 자동 입력했어요.`);
        },
      },
    );
    // mutation 객체는 매 렌더 새 identity 라서 deps 에서 제외 — ref 가 중복 호출을 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectionCandidateId,
    fetchedData?.product?.basicInfo?.kcCertificationStatus,
    kidsPlayfulEntries,
    boldEntries,
  ]);

  const handleSaveThumbnailConfiguration = async (input: {
    thumbnailUrls: string[];
    selectedThumbnail: RegistrationThumbnailOption | null;
  }) => {
    if (!selectionCandidateId) return;
    const thumbnailUrls = uniqueNonEmpty(input.thumbnailUrls);
    setThumbnailPreviewImages(thumbnailUrls);
    if (input.selectedThumbnail) {
      setSelectedRegistrationThumbnailUrl(input.selectedThumbnail.url);
    }
    try {
      await updateBasicInfoMutation.mutateAsync({ thumbnailUrls });
      if (input.selectedThumbnail) {
        await selectThumbnailMutation.mutateAsync(input.selectedThumbnail);
      }
      toast.success('썸네일 구성을 저장했습니다.');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '썸네일 구성 저장에 실패했습니다.');
    }
  };

  const selectDetailPageMutation = useMutation({
    mutationFn: (input: {
      selectedDetailPageGenerationId: string;
      selectedDetailPageArtifactId?: string | null;
      selectedDetailPageRevisionId?: string | null;
    }) => {
      if (!selectionCandidateId) return Promise.resolve(null);
      return candidatesApi.selectDetailPage(selectionCandidateId, input);
    },
    onSuccess: () => {
      if (selectionCandidateId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(selectionCandidateId) });
      }
    },
  });

  useEffect(() => {
    if (!fetchedData || editInitialized) return;
    const basicInfo = fetchedData.product.basicInfo;
    const nextEditData = basicInfo
      ? {
          ...fetchedData.editState,
          name: basicInfo.name || fetchedData.editState.name,
          category: basicInfo.category,
          originalPrice: basicInfo.originalPrice,
          salePrice: basicInfo.salePrice || fetchedData.editState.salePrice,
          discountRate: basicInfo.discountRate,
          thumbnails: basicInfo.thumbnailUrls.length > 0
            ? basicInfo.thumbnailUrls
            : fetchedData.editState.thumbnails,
          tags: basicInfo.tags,
        }
      : fetchedData.editState;
    setEditData(nextEditData);
    setSelectedRegistrationThumbnailUrl(
      basicInfo?.selectedThumbnailUrl ??
      fetchedData.product.productPreparation?.selectedThumbnailUrl ??
      nextEditData.thumbnails[0] ??
      null,
    );
    setThumbnailPreviewImages(
      basicInfo?.thumbnailPreviewUrls && basicInfo.thumbnailPreviewUrls.length > 0
        ? basicInfo.thumbnailPreviewUrls
        : uniqueNonEmpty([
          basicInfo?.selectedThumbnailUrl,
          fetchedData.product.productPreparation?.selectedThumbnailUrl,
          fetchedData.product.thumbnail_url,
          nextEditData.thumbnails[0],
        ]),
    );
    setEditInitialized(true);
  }, [editInitialized, fetchedData]);

  const updateField = <K extends keyof ProductEditState>(
    field: K,
    value: ProductEditState[K],
  ) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    if (field === 'thumbnails') {
      const next = value as string[];
      setSelectedRegistrationThumbnailUrl((selected) =>
        selected && !next.includes(selected) ? null : selected,
      );
    }
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

  const mobilePreviewData = useMemo(
    () =>
      buildProductRegistrationPreviewData({
        editData,
        selectedRegistrationThumbnailUrl,
        thumbnailPreviewUrl,
        thumbnailPreviewImages,
        preferThumbnailPreview: activeTab === 'thumbnail',
      }),
    [activeTab, editData, selectedRegistrationThumbnailUrl, thumbnailPreviewImages, thumbnailPreviewUrl],
  );
  const detailGenerationRows = useMemo(() => buildDetailGenerationRows({
    agentHistory,
    kidsPlayfulEntries,
    boldEntries,
    savedDetailPageGenerationId: effectiveSavedDetailPageGenerationId,
  }), [
    agentHistory,
    boldEntries,
    effectiveSavedDetailPageGenerationId,
    kidsPlayfulEntries,
  ]);
  const latestCompletedDetailPageGenerationId = useMemo(
    () => detailGenerationRows.find((row) => row.isCompletedVersion)?.id ?? null,
    [detailGenerationRows],
  );
  const selectedDetailMobilePreviewHtml = useMemo(() => {
    const previewGenerationIds = uniqueNonEmpty([
      effectiveSavedDetailPageGenerationId,
      latestCompletedDetailPageGenerationId,
    ]);

    for (const generationId of previewGenerationIds) {
      if (
        generationId === effectiveSavedDetailPageGenerationId &&
        isRenderableDetailHtml(selectedDetailEditedHtml?.html)
      ) {
        return ensureStyledDetailHtml(selectedDetailEditedHtml.html, templateCss);
      }

      const agentEntry = agentHistory.find((item) => item.id === generationId);
      if (agentEntry?.detailPageData) {
        try {
          return buildGenerationHistoryHtml(agentEntry, templateCss);
        } catch {
          continue;
        }
      }

      const generatedEntry = [...kidsPlayfulEntries, ...boldEntries]
        .find((item) => item.id === generationId);
      if (generatedEntry) {
        try {
          return buildDetailGenerationEntryHtml(generatedEntry, templateCss);
        } catch {
          continue;
        }
      }
    }
    return null;
  }, [
    agentHistory,
    boldEntries,
    effectiveSavedDetailPageGenerationId,
    kidsPlayfulEntries,
    latestCompletedDetailPageGenerationId,
    selectedDetailEditedHtml?.html,
    templateCss,
  ]);
  const thumbnailWorkspaceReturnHref = useMemo(
    () =>
      buildProductWorkspaceTabUrl({
        pathname: selfHref,
        tab: 'thumbnail',
      }),
    [selfHref],
  );
  const selectedDetailPageSummary = useMemo(() => {
    if (!effectiveSavedDetailPageGenerationId) return null;
    const row = detailGenerationRows.find((item) => item.id === effectiveSavedDetailPageGenerationId);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      templateLabel: row.templateLabel,
      createdAt: row.createdAt,
      status: row.status,
    };
  }, [detailGenerationRows, effectiveSavedDetailPageGenerationId]);

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
  const sidePreviewDetailHtml =
    activeTab === 'detail' ? detailWorkspacePreviewHtml : selectedDetailMobilePreviewHtml;

  return (
    <div
      data-testid="product-workspace-screen"
      className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col overflow-hidden"
    >
      <ProductEditHeader
        productName={editData.name || '(상품명 없음)'}
        productId={productId}
        status={product?.status}
        promotedMasterId={promotedMasterId}
        isEditComplete={isEditComplete}
        isLocked={isLocked}
        selectedThumbnailUrl={selectedRegistrationThumbnailUrl}
        selectedThumbnailGenerationCandidateId={selectedThumbnailGenerationCandidateId}
        selectedDetailPageGenerationId={effectiveSavedDetailPageGenerationId}
        detailGenerationContentWorkspaceId={detailGenerationContentWorkspaceId}
        showCandidateActions={showCandidateActions}
        onOpenDetailTemplateGeneration={onOpenDetailTemplateGeneration}
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
            rawInput: e.rawInput,
            // detail 페이지는 product 단일이라 productName 생략 — 헤더에 이미 표시
          }))}
          onCancel={async (entry) => {
            await cancelDetailGeneration.mutateAsync(entry.id);
          }}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex min-h-0 w-[72%] flex-col overflow-hidden border-r border-slate-200"
        >
          <ProductEditTabs activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
            <ProductTabContent
              activeTab={activeTab}
              editData={editData}
              basicInfo={product?.basicInfo ?? null}
              updateField={updateField}
              onCommitBasicInfo={handleCommitBasicInfo}
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
              contentWorkspaceId={effectiveContentWorkspaceId}
              generationQueryProductId={detailGenerationProductId}
              generationQuerySourceCandidateId={detailGenerationSourceCandidateId}
              generationQueryContentWorkspaceId={detailGenerationContentWorkspaceId}
              hasSavedDetailPage={hasSavedDetailPage}
              savedDetailPageGenerationId={effectiveSavedDetailPageGenerationId}
              initialAgentHistory={initialAgentHistory}
              generationHistoryQueryEnabled={generationHistoryQueryEnabled}
              thumbnailSourceCandidateId={thumbnailSourceCandidateId}
              detailEditorSourceCandidateId={thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId}
              detailEditorReturnHref={selfHref}
              onSelectKidsPlayful={(id) => {
                setSelectedKidsPlayfulId(id);
                if (id) {
                  setSelectedBoldVerticalId(null);
                  setSelectedAgentId(null);
                }
              }}
              onSelectBoldVertical={(id) => {
                setSelectedBoldVerticalId(id);
                if (id) {
                  setSelectedKidsPlayfulId(null);
                  setSelectedAgentId(null);
                }
              }}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                if (id) {
                  setSelectedKidsPlayfulId(null);
                  setSelectedBoldVerticalId(null);
                }
              }}
              onApplyRegistrationDetailPage={(input) =>
                selectDetailPageMutation.mutateAsync(input).then(() => undefined)
              }
              selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
              thumbnailPreviewImages={thumbnailPreviewImages}
              mobilePreviewData={mobilePreviewData}
              onPreviewThumbnail={setThumbnailPreviewUrl}
              onThumbnailPreviewImagesChange={setThumbnailPreviewImages}
              onSaveThumbnailConfiguration={handleSaveThumbnailConfiguration}
              thumbnailGenerationReturnHref={thumbnailWorkspaceReturnHref}
              selectedDetailPageSummary={selectedDetailPageSummary}
              onDetailPreviewHtmlChange={setDetailWorkspacePreviewHtml}
            />
          </div>
        </div>

        <div className="min-h-0 w-[28%] overflow-hidden bg-slate-50/50 p-5">
          <MobilePreview
            {...mobilePreviewData}
            detailHtml={sidePreviewDetailHtml}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}
