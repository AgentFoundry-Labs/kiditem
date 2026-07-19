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
import { contentWorkspacesApi } from '../../lib/content-workspaces-api';
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
  detailGenerationEnabled?: boolean;
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
  detailGenerationEnabled = true,
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
  /**
   * 실제로 **저장된** 대표 썸네일. `selectedRegistrationThumbnailUrl` 과 분리한다.
   *
   * 후자는 편집용 선택값이라 아무것도 저장돼 있지 않으면 첫 썸네일로 폴백하는데,
   * 그 값을 `등록 대표` 배지에 그대로 쓰면 **저장한 적 없는 이미지에 배지가 붙는다.**
   * 사용자가 "이미 대표로 지정했다" 고 오인하게 만든 원인이라 표시용 근거를 분리했다.
   * 폴백 없이 서버가 준 값만 담는다.
   */
  const [savedRepresentativeThumbnailUrl, setSavedRepresentativeThumbnailUrl] = useState<string | null>(null);
  const [selectedThumbnailGenerationId, setSelectedThumbnailGenerationId] = useState<string | null>(null);
  const [selectedThumbnailGenerationCandidateId, setSelectedThumbnailGenerationCandidateId] = useState<string | null>(null);
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
  const productPreparation = product?.productPreparation ?? null;
  const editablePreparationId = productPreparation?.status === 'draft'
    ? productPreparation.id
    : null;
  const detailGenerationProductId = productId;
  const detailGenerationContentWorkspaceId =
    contentWorkspaceId ?? productPreparation?.sourceContentWorkspaceId ?? null;
  const detailGenerationSourceCandidateId =
    detailGenerationContentWorkspaceId ? null : productId;
  const effectiveContentWorkspaceId = detailGenerationContentWorkspaceId;
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
  const thumbnailGenerations = useSourcingThumbnailGenerations({
    sourceCandidateId: effectiveThumbnailSourceCandidateId,
    contentWorkspaceId: effectiveContentWorkspaceId,
  });
  const loadError = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '상품 정보를 불러올 수 없습니다.'
    : null;

  const selectThumbnailMutation = useMutation({
    mutationFn: (option: RegistrationThumbnailOption) => {
      if (!editablePreparationId) {
        throw new Error('먼저 채널 등록 준비를 만들어 주세요.');
      }
      return candidatesApi.selectThumbnail(editablePreparationId, {
        selectedThumbnailUrl: option.url,
        selectedThumbnailGenerationId: option.generatedGenerationId ?? null,
        selectedThumbnailGenerationCandidateId: option.generatedCandidateId ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
    },
  });

  const updateBasicInfoMutation = useMutation({
    mutationFn: (input: UpdateProductBasicsInput) => {
      if (!editablePreparationId) {
        throw new Error('먼저 채널 등록 준비를 만들어 주세요.');
      }
      return candidatesApi.updateBasicInfo(editablePreparationId, {
        ...input,
        basePreparationUpdatedAt: productPreparation?.updatedAt ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
    },
  });

  const handleCommitBasicInfo = async (input: UpdateProductBasicsInput) => {
    await updateBasicInfoMutation.mutateAsync(input);
  };

  const kcAutoFilledRef = useRef<string | null>(null);
  useEffect(() => {
    setIsEditComplete(false);
    setIsLocked(false);
    setEditData(PLACEHOLDER_DATA);
    setEditInitialized(false);
    setSelectedKidsPlayfulId(null);
    setSelectedBoldVerticalId(null);
    setSelectedAgentId(null);
    setSelectedRegistrationThumbnailUrl(null);
    setSelectedThumbnailGenerationId(null);
    setSelectedThumbnailGenerationCandidateId(null);
    setThumbnailPreviewUrl(null);
    setThumbnailPreviewImages([]);
    setDetailWorkspacePreviewHtml(null);
    kcAutoFilledRef.current = null;
  }, [contentWorkspaceId, productId, thumbnailSourceCandidateId]);

  useEffect(() => {
    if (!editablePreparationId) return;
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
    // mutation 객체는 매 렌더 새 identity 라서 ref 로 중복 호출을 막는다.
  }, [
    editablePreparationId,
    fetchedData?.product?.basicInfo?.kcCertificationStatus,
    kidsPlayfulEntries,
    boldEntries,
  ]);

  const handleSaveThumbnailConfiguration = async (input: {
    thumbnailUrls: string[];
    selectedThumbnail: RegistrationThumbnailOption | null;
  }) => {
    const thumbnailUrls = uniqueNonEmpty(input.thumbnailUrls);
    setThumbnailPreviewImages(thumbnailUrls);
    if (input.selectedThumbnail) {
      setSelectedRegistrationThumbnailUrl(input.selectedThumbnail.url);
      setSelectedThumbnailGenerationId(
        input.selectedThumbnail.generatedGenerationId ?? null,
      );
      setSelectedThumbnailGenerationCandidateId(
        input.selectedThumbnail.generatedCandidateId ?? null,
      );
    }
    try {
      if (editablePreparationId) {
        await updateBasicInfoMutation.mutateAsync({ thumbnailUrls });
        if (input.selectedThumbnail) {
          await selectThumbnailMutation.mutateAsync(input.selectedThumbnail);
        }
      } else if (effectiveContentWorkspaceId) {
        // 준비(ProductPreparation)가 없으면 `registrationInput.thumbnailUrls` 에 쓸 수 없다.
        // 예전에는 이 분기에서 대표 1장만 저장하고 목록을 조용히 버렸는데, 성공 토스트는
        // 그대로 떠서 저장된 것처럼 보였다. 목록은 워크스페이스 썸네일 갤러리
        // (= ContentAsset role='thumbnail')로 저장한다 — 쿠팡 WING 추가이미지가 읽는 곳이다.
        await contentWorkspacesApi.replaceThumbnailGallery(
          effectiveContentWorkspaceId,
          thumbnailUrls,
        );
        if (input.selectedThumbnail) {
          await contentWorkspacesApi.selectCurrentThumbnail(
            effectiveContentWorkspaceId,
            contentWorkspaceThumbnailSelection(input.selectedThumbnail),
          );
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.contentWorkspaces.detail(effectiveContentWorkspaceId),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all }),
          // 저장한 갤러리는 `basicInfo.registrationImages.thumbnail` 로 다시 읽힌다.
          queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) }),
        ]);
      } else {
        throw new Error('저장 가능한 썸네일 구성이 없습니다.');
      }
      // 배지는 서버 저장이 끝난 뒤에만 갱신한다. 위의 setSelectedRegistrationThumbnailUrl 처럼
      // 낙관적으로 먼저 반영하면 저장이 실패해도 `등록 대표` 가 붙어버린다.
      if (input.selectedThumbnail) {
        setSavedRepresentativeThumbnailUrl(input.selectedThumbnail.url);
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
      if (!editablePreparationId) {
        throw new Error('먼저 채널 등록 준비를 만들어 주세요.');
      }
      return candidatesApi.selectDetailPage(editablePreparationId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
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
    // 배지용 값에는 `nextEditData.thumbnails[0]` 폴백을 **넣지 않는다**.
    // 저장된 대표가 없으면 null 이어야 배지가 안 붙는다.
    setSavedRepresentativeThumbnailUrl(
      basicInfo?.selectedThumbnailUrl ??
      fetchedData.product.productPreparation?.selectedThumbnailUrl ??
      null,
    );
    setSelectedThumbnailGenerationId(
      basicInfo?.selectedThumbnailGenerationId
      ?? fetchedData.product.productPreparation?.selectedThumbnailGenerationId
      ?? null,
    );
    setSelectedThumbnailGenerationCandidateId(
      basicInfo?.selectedThumbnailGenerationCandidateId
      ?? fetchedData.product.productPreparation?.selectedThumbnailGenerationCandidateId
      ?? null,
    );
    // 준비가 있으면 `thumbnailPreviewUrls`, 없으면 워크스페이스 갤러리
    // (`registrationImages.thumbnail`)가 저장된 목록이다. 후자를 안 읽으면
    // 저장은 됐는데 화면에는 안 보이는 상태가 된다.
    const savedThumbnailGallery = basicInfo?.registrationImages?.thumbnail ?? [];
    setThumbnailPreviewImages(
      basicInfo?.thumbnailPreviewUrls && basicInfo.thumbnailPreviewUrls.length > 0
        ? basicInfo.thumbnailPreviewUrls
        : savedThumbnailGallery.length > 0
        ? savedThumbnailGallery
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
      if (selectedRegistrationThumbnailUrl
        && !next.includes(selectedRegistrationThumbnailUrl)) {
        setSelectedRegistrationThumbnailUrl(null);
        setSelectedThumbnailGenerationId(null);
        setSelectedThumbnailGenerationCandidateId(null);
      }
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
        productPreparation={productPreparation}
        basicInfo={product?.basicInfo ?? null}
        costCny={product?.cost_cny ?? null}
        isEditComplete={isEditComplete}
        isLocked={isLocked}
        selectedThumbnailUrl={selectedRegistrationThumbnailUrl}
        selectedThumbnailGenerationId={selectedThumbnailGenerationId}
        selectedThumbnailGenerationCandidateId={selectedThumbnailGenerationCandidateId}
        selectedDetailPageGenerationId={effectiveSavedDetailPageGenerationId}
        detailGenerationContentWorkspaceId={detailGenerationContentWorkspaceId}
        detailGenerationEnabled={detailGenerationEnabled}
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
              costCny={product?.cost_cny ?? null}
              updateField={updateField}
              onCommitBasicInfo={editablePreparationId ? handleCommitBasicInfo : undefined}
              nameLength={nameLength}
              productId={productId}
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
              onApplyRegistrationDetailPage={editablePreparationId
                ? (input) => selectDetailPageMutation.mutateAsync(input).then(() => undefined)
                : undefined}
              selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
              savedRepresentativeThumbnailUrl={savedRepresentativeThumbnailUrl}
              thumbnailPreviewImages={thumbnailPreviewImages}
              mobilePreviewData={mobilePreviewData}
              onPreviewThumbnail={setThumbnailPreviewUrl}
              onThumbnailPreviewImagesChange={setThumbnailPreviewImages}
              onSaveThumbnailConfiguration={handleSaveThumbnailConfiguration}
              // 준비가 없어도 워크스페이스가 있으면 갤러리로 저장할 수 있다.
              // 둘 다 없을 때만 감춘다 — 눌러서 에러 나는 버튼보다 낫다.
              canSaveThumbnailConfiguration={Boolean(
                editablePreparationId || effectiveContentWorkspaceId,
              )}
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

function contentWorkspaceThumbnailSelection(option: RegistrationThumbnailOption) {
  if (option.generatedGenerationId && option.generatedCandidateId) {
    return {
      sourceThumbnailGenerationId: option.generatedGenerationId,
      sourceThumbnailCandidateId: option.generatedCandidateId,
    };
  }
  return { externalUrl: option.url };
}
