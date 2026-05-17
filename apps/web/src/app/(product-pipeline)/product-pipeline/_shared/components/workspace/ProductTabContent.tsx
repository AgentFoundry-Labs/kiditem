'use client';

import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
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
import type {
  ProductBasics,
  UpdateProductBasicsInput,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

interface Props {
  activeTab: EditTabType;
  editData: ProductEditState;
  basicInfo?: ProductBasics | null;
  updateField: <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => void;
  onCommitBasicInfo?: (input: UpdateProductBasicsInput) => void;
  nameLength: number;
  productId: string;
  promotedMasterId: string | null;
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
  onSelectRegistrationThumbnail: (option: RegistrationThumbnailOption) => void;
  thumbnailGenerationReturnHref: string;
  selectedDetailPageSummary?: SelectedDetailPageSummary | null;
  onDetailPreviewHtmlChange?: (html: string | null) => void;
}

export default function ProductTabContent({
  activeTab,
  editData,
  basicInfo = null,
  updateField,
  onCommitBasicInfo,
  nameLength,
  productId,
  promotedMasterId,
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
  mobilePreviewData,
  onPreviewThumbnail,
  onSelectRegistrationThumbnail,
  thumbnailGenerationReturnHref,
  selectedDetailPageSummary = null,
  onDetailPreviewHtmlChange,
}: Props) {
  const effectiveThumbnailSourceCandidateId =
    thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId;
  const initialBasicDraft = useMemo(
    () => basicDraftFrom({ basicInfo, editData }),
    [
      basicInfo,
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
  const saveBasicEditing = () => {
    const input = productBasicsInputFromDraft(basicDraft);
    updateField('name', input.name ?? '');
    updateField('category', input.category ?? '');
    updateField('tags', input.tags ?? []);
    updateField('salePrice', input.salePrice ?? 0);
    updateField('originalPrice', input.originalPrice ?? 0);
    updateField('discountRate', input.discountRate ?? 0);
    onCommitBasicInfo?.(input);
    setIsBasicEditing(false);
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
            nameLength={nameLength}
            isEditing={isBasicEditing}
            draft={basicDraft}
            onDraftChange={updateBasicDraft}
            onDraftTagsChange={updateBasicDraftTags}
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
          promotedMasterId={promotedMasterId}
          contentWorkspaceId={contentWorkspaceId}
          thumbnailSourceCandidateId={effectiveThumbnailSourceCandidateId}
          selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
          onPreviewThumbnail={onPreviewThumbnail}
          onSelectRegistrationThumbnail={onSelectRegistrationThumbnail}
          onThumbnailsChange={(v) => updateField('thumbnails', v)}
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
