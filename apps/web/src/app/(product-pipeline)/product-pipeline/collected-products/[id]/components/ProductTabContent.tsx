'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  thumbnailGenerationEditHref,
  thumbnailGenerationHubHref,
} from '../../../_shared/lib/product-pipeline-routes';
import ThumbnailGrid from '../../components/detail/ThumbnailGrid';
import TagEditor from '../../components/detail/TagEditor';
import RawDataTab from '../../components/detail/RawDataTab';
import { useSourcingThumbnailGenerations } from '../hooks/useGenerateSourcingThumbnail';
import { CATEGORIES } from '../lib/types';
import GenerationHistoryTab from './GenerationHistoryTab';
import DetailPagePreview from './DetailPagePreview';
import { buildRegistrationThumbnailOptions } from '../../lib/registration-selection';
import { writeThumbnailEditorUpload } from '../../../thumbnail-generation/edit/lib/upload-session';
import type { EditTabType } from '../../components/detail/ProductEditTabs';
import type { ProductEditState } from '../lib/types';
import type { GenerationHistoryItem } from '../hooks/useGenerationHistory';

interface Props {
  activeTab: EditTabType;
  editData: ProductEditState;
  updateField: <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => void;
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
  registrationWorkspaceId?: string | null;
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
  selectedRegistrationThumbnailUrl: string | null;
  onSelectRegistrationThumbnail: (url: string | null) => void;
  thumbnailGenerationReturnHref: string;
}

export default function ProductTabContent({
  activeTab,
  editData,
  updateField,
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
  registrationWorkspaceId,
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
  selectedRegistrationThumbnailUrl,
  onSelectRegistrationThumbnail,
  thumbnailGenerationReturnHref,
}: Props) {
  const router = useRouter();
  const effectiveThumbnailSourceCandidateId =
    thumbnailSourceCandidateId === undefined ? productId : thumbnailSourceCandidateId;
  const thumbnailGenerations = useSourcingThumbnailGenerations({
    sourceCandidateId: effectiveThumbnailSourceCandidateId,
    registrationWorkspaceId,
  });
  const thumbnailOptions = useMemo(() => {
    return buildRegistrationThumbnailOptions({
      sourceImageUrls: editData.thumbnails,
      generations: thumbnailGenerations.data ?? [],
    });
  }, [editData.thumbnails, thumbnailGenerations.data]);
  const buildThumbnailRouteParams = () => {
    const productImage = selectedRegistrationThumbnailUrl ?? editData.thumbnails[0];
    if (!productImage) {
      toast.error('먼저 썸네일 이미지를 추가해주세요');
      return null;
    }

    const shouldUseUploadKey =
      productImage.startsWith('data:') ||
      productImage.startsWith('blob:') ||
      productImage.length > 1500;
    const uploadKey = shouldUseUploadKey
      ? writeThumbnailEditorUpload(productImage, { productName: editData.name, mode: 'edit' })
      : null;

    return {
      imageUrl: uploadKey ? null : productImage,
      productName: editData.name,
      productDescription: editData.name,
      returnTo: thumbnailGenerationReturnHref,
      subjectParams: {
        registrationWorkspaceId,
        productId: promotedMasterId,
        sourceCandidateId: promotedMasterId ? null : effectiveThumbnailSourceCandidateId,
      },
      extraParams: uploadKey ? { uploadKey } : undefined,
    };
  };

  const handleOpenThumbnailEditor = () => {
    const params = buildThumbnailRouteParams();
    if (!params) return;

    router.push(thumbnailGenerationEditHref({
      editCase: 'single',
      mode: 'edit',
      ...params,
    }));
  };

  const handleOpenThumbnailGeneration = () => {
    const params = buildThumbnailRouteParams();
    if (!params) return;

    router.push(thumbnailGenerationHubHref(params));
  };

  switch (activeTab) {
    case 'basic':
      return (
        <div className="space-y-4 p-5">
          <div className="card p-5">
            <ThumbnailGrid
              thumbnails={editData.thumbnails}
              registrationOptions={thumbnailOptions}
              selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
              onSelectRegistrationThumbnail={onSelectRegistrationThumbnail}
              onThumbnailsChange={(v) => updateField('thumbnails', v)}
              onOpenThumbnailGeneration={handleOpenThumbnailGeneration}
              onOpenThumbnailEditor={handleOpenThumbnailEditor}
            />
          </div>

          <div className="card p-5">
            <div className="space-y-3">
              <label className="text-base font-semibold text-slate-800">카테고리</label>
              <div className="relative">
                <select
                  value={editData.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="w-full appearance-none px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors cursor-pointer"
                >
                  <option value="">카테고리 선택</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold text-slate-800">상품명</label>
                <span className={cn('text-sm font-medium', nameLength > 100 ? 'text-red-500' : 'text-slate-400')}>
                  {nameLength}/100자
                </span>
              </div>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
                placeholder="상품명을 입력하세요"
                maxLength={100}
              />
            </div>
          </div>

          <div className="card p-5">
            <TagEditor
              tags={editData.tags}
              onTagsChange={(v) => updateField('tags', v)}
            />
          </div>

          {editData.productInfo.length > 0 && (
            <div className="card p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-base font-semibold text-slate-800">상품정보제공공시</label>
                  <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                    편집
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editData.productInfo.map((item) => (
                    <div
                      key={item.key}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm hover:border-slate-300 transition-colors"
                    >
                      <span className="text-slate-500 font-medium">{item.key}:</span>
                      <span className="text-slate-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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

    case 'detail':
      return (
        <DetailPagePreview
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
        />
      );

    case 'history':
      return (
        <GenerationHistoryTab
          productId={productId}
          templateCss={templateCss}
          selectedKidsPlayfulId={selectedKidsPlayfulId}
          selectedBoldVerticalId={selectedBoldVerticalId}
          selectedAgentId={selectedAgentId}
          registrationWorkspaceId={registrationWorkspaceId}
          initialAgentHistory={initialAgentHistory}
          generationHistoryQueryEnabled={generationHistoryQueryEnabled}
          onSelectKidsPlayful={onSelectKidsPlayful}
          onSelectBoldVertical={onSelectBoldVertical}
          onSelectAgent={onSelectAgent}
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
