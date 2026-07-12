'use client';

import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import type {
  ProductBasics,
  UpdateProductBasicsInput,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';
import RawDataTab from './detail/RawDataTab';
import DetailPageWorkspaceTab from './detail/DetailPageWorkspaceTab';
import ThumbnailWorkspaceTab from './thumbnail/ThumbnailWorkspaceTab';
import ProductBasicsTab, {
  basicDraftFrom,
  productBasicsInputFromDraft,
  type BasicDraft,
  type SelectedDetailPageSummary,
} from './basic/ProductBasicsTab';
import type { EditTabType } from './detail/ProductEditTabs';
import type { ProductEditState } from '../../lib/product-workspace-types';
import type { GenerationHistoryItem } from '../../hooks/useGenerationHistory';
import type { ProductRegistrationPreviewData } from './preview/product-registration-preview';

interface Props {
  activeTab: EditTabType;
  editData: ProductEditState;
  basicInfo?: ProductBasics | null;
  costCny?: number | null;
  updateField: <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => void;
  onCommitBasicInfo?: (input: UpdateProductBasicsInput) => Promise<void> | void;
  nameLength: number;
  productId: string;
  detailPreviewHtml: string;
  editedHtml: string | null;
  templateCss: string;
  rawData: Record<string, unknown> | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
  /** 사용자가 생성 이력에서 고른 KP entry id. null = 최신 자동. */
  selectedKidsPlayfulId: string | null;
  /** 사용자가 생성 이력에서 고른 KIDITEM DESIGN entry id. */
  selectedBoldVerticalId: string | null;
  /** 사용자가 생성 이력에서 고른 ContentAgent entry id. */
  selectedAgentId: string | null;
  contentWorkspaceId?: string | null;
  generationQueryProductId?: string | null;
  generationQuerySourceCandidateId?: string | null;
  generationQueryContentWorkspaceId?: string | null;
  hasSavedDetailPage?: boolean;
  savedDetailPageGenerationId?: string | null;
  initialAgentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  thumbnailSourceCandidateId?: string | null;
  detailEditorSourceCandidateId?: string | null;
  detailEditorReturnHref?: string;
  onSelectKidsPlayful: (id: string | null) => void;
  onSelectBoldVertical: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
  onApplyRegistrationDetailPage?: (input: {
    selectedDetailPageGenerationId: string;
    selectedDetailPageArtifactId?: string | null;
    selectedDetailPageRevisionId?: string | null;
  }) => Promise<void> | void;
  selectedRegistrationThumbnailUrl: string | null;
  mobilePreviewData: ProductRegistrationPreviewData;
  onPreviewThumbnail: (url: string | null) => void;
  thumbnailPreviewImages: string[];
  onThumbnailPreviewImagesChange: (images: string[]) => void;
  onSaveThumbnailConfiguration: (input: {
    thumbnailUrls: string[];
    selectedThumbnail: RegistrationThumbnailOption | null;
  }) => Promise<void> | void;
  thumbnailGenerationReturnHref: string;
  selectedDetailPageSummary?: SelectedDetailPageSummary | null;
  onDetailPreviewHtmlChange?: (html: string | null) => void;
}

export default function ProductTabContent({
  activeTab,
  editData,
  basicInfo = null,
  costCny = null,
  updateField,
  onCommitBasicInfo,
  nameLength,
  productId,
  detailPreviewHtml,
  editedHtml,
  templateCss,
  rawData,
  imageUrls,
  thumbnailUrl,
  selectedKidsPlayfulId,
  selectedBoldVerticalId,
  selectedAgentId,
  contentWorkspaceId,
  generationQueryProductId,
  generationQuerySourceCandidateId,
  generationQueryContentWorkspaceId,
  hasSavedDetailPage,
  savedDetailPageGenerationId,
  initialAgentHistory,
  generationHistoryQueryEnabled = true,
  thumbnailSourceCandidateId,
  detailEditorSourceCandidateId,
  detailEditorReturnHref,
  onSelectKidsPlayful,
  onSelectBoldVertical,
  onSelectAgent,
  onApplyRegistrationDetailPage,
  selectedRegistrationThumbnailUrl,
  thumbnailPreviewImages,
  mobilePreviewData,
  onPreviewThumbnail,
  onThumbnailPreviewImagesChange,
  onSaveThumbnailConfiguration,
  thumbnailGenerationReturnHref,
  selectedDetailPageSummary = null,
  onDetailPreviewHtmlChange,
}: Props) {
  const effectiveThumbnailSourceCandidateId =
    thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId;
  const initialBasicDraft = useMemo(
    () => basicDraftFrom({ basicInfo, editData, costCny }),
    [
      basicInfo,
      costCny,
      editData.category,
      editData.discountRate,
      editData.name,
      editData.originalPrice,
      editData.salePrice,
      editData.tags,
    ],
  );
  const [basicDraft, setBasicDraft] = useState(initialBasicDraft);
  const [isBasicEditing, setIsBasicEditing] = useState(false);
  const [isBasicSaving, setIsBasicSaving] = useState(false);
  const [isKcImageSaving, setIsKcImageSaving] = useState(false);

  useEffect(() => {
    if (!isBasicEditing) {
      setBasicDraft(initialBasicDraft);
    }
  }, [initialBasicDraft, isBasicEditing]);

  const updateBasicDraft = (field: keyof BasicDraft, value: string) => {
    setBasicDraft((current) => ({ ...current, [field]: value }));
  };
  const updateBasicDraftTags = (tags: string[]) => {
    setBasicDraft((current) => ({ ...current, tags }));
  };
  const cancelBasicEditing = () => {
    setBasicDraft(initialBasicDraft);
    setIsBasicEditing(false);
  };
  const saveBasicEditing = async () => {
    const input = productBasicsInputFromDraft(basicDraft);
    setIsBasicSaving(true);
    try {
      await onCommitBasicInfo?.(input);
      updateField('name', input.name ?? '');
      updateField('category', input.category ?? '');
      updateField('tags', input.tags ?? []);
      updateField('salePrice', input.salePrice ?? 0);
      updateField('originalPrice', input.originalPrice ?? 0);
      updateField('discountRate', input.discountRate ?? 0);
      setIsBasicEditing(false);
    } catch {
      // QueryClient/global error handling shows the API message; keep the draft open.
    } finally {
      setIsBasicSaving(false);
    }
  };

  // 보기 모드에서 KC 인증 이미지를 올리면 수정/저장 없이 바로 저장한다.
  const commitKcImage = async (value: string) => {
    setBasicDraft((current) => ({ ...current, kcCertificationImageUrl: value }));
    setIsKcImageSaving(true);
    try {
      await onCommitBasicInfo?.({ kcCertificationImageUrl: value });
      toast.success(value ? 'KC 인증 이미지를 저장했어요.' : 'KC 인증 이미지를 삭제했어요.');
    } catch (err) {
      setBasicDraft(initialBasicDraft);
      toast.error(isApiError(err) ? err.detail : 'KC 인증 이미지 저장에 실패했어요.');
    } finally {
      setIsKcImageSaving(false);
    }
  };

  switch (activeTab) {
    case 'basic':
      return (
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-end">
            {isBasicEditing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelBasicEditing}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveBasicEditing}
                  disabled={isBasicSaving}
                  className="h-9 rounded-md bg-emerald-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
                >
                  저장
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsBasicEditing(true)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                수정
              </button>
            )}
          </div>
          <ProductBasicsTab
            editData={editData}
            basicInfo={basicInfo}
            costCny={costCny}
            nameLength={nameLength}
            isEditing={isBasicEditing}
            draft={basicDraft}
            onDraftChange={updateBasicDraft}
            onDraftTagsChange={updateBasicDraftTags}
            onCommitKcImage={commitKcImage}
            isKcImageSaving={isKcImageSaving}
            selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
            selectedDetailPageGenerationId={savedDetailPageGenerationId}
            selectedDetailPageSummary={selectedDetailPageSummary}
          />
        </div>
      );

    case 'options':
      return (
        <div className="p-5">
          <div className="card p-8">
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Settings size={40} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium">옵션 및 판매가 설정</p>
              <p className="text-xs text-slate-400 mt-1">준비 중인 기능입니다</p>
            </div>
          </div>
        </div>
      );

    case 'thumbnail':
      return (
        <ThumbnailWorkspaceTab
          editData={editData}
          productId={productId}
          contentWorkspaceId={contentWorkspaceId}
          thumbnailUrl={thumbnailUrl}
          thumbnailSourceCandidateId={effectiveThumbnailSourceCandidateId}
          selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
          thumbnailPreviewImages={thumbnailPreviewImages}
          onPreviewThumbnail={onPreviewThumbnail}
          onThumbnailPreviewImagesChange={onThumbnailPreviewImagesChange}
          onSaveThumbnailConfiguration={onSaveThumbnailConfiguration}
          thumbnailGenerationReturnHref={thumbnailGenerationReturnHref}
        />
      );

    case 'detail':
      return (
        <DetailPageWorkspaceTab
          productId={productId}
          detailPreviewHtml={detailPreviewHtml}
          editedHtml={editedHtml}
          templateCss={templateCss}
          hasSavedDetailPage={hasSavedDetailPage}
          savedDetailPageGenerationId={savedDetailPageGenerationId}
          initialAgentHistory={initialAgentHistory}
          generationHistoryQueryEnabled={generationHistoryQueryEnabled}
          detailEditorSourceCandidateId={detailEditorSourceCandidateId}
          detailEditorReturnHref={detailEditorReturnHref ?? thumbnailGenerationReturnHref}
          contentWorkspaceId={contentWorkspaceId}
          generationQueryProductId={generationQueryProductId}
          generationQuerySourceCandidateId={generationQuerySourceCandidateId}
          generationQueryContentWorkspaceId={generationQueryContentWorkspaceId}
          selectedKidsPlayfulId={selectedKidsPlayfulId}
          selectedBoldVerticalId={selectedBoldVerticalId}
          selectedAgentId={selectedAgentId}
          mobilePreviewData={mobilePreviewData}
          onPreviewHtmlChange={onDetailPreviewHtmlChange}
          onSelectKidsPlayful={onSelectKidsPlayful}
          onSelectBoldVertical={onSelectBoldVertical}
          onSelectAgent={onSelectAgent}
          onApplyRegistrationDetailPage={onApplyRegistrationDetailPage}
        />
      );

    case 'raw':
      return (
        <RawDataTab
          productId={productId}
          rawData={rawData}
          imageUrls={imageUrls}
          thumbnailUrl={thumbnailUrl}
        />
      );

    default:
      return null;
  }
}
