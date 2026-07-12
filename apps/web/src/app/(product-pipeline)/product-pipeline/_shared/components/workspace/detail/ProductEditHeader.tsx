'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useKidsPlayfulInProgress } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { useGenerateDetailPage, type GenerateMode } from '@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../../hooks/useKidsPlayfulFromSourcing';
import TemplateSelectionModal from '@/app/(product-pipeline)/product-pipeline/_shared/components/detail-page/TemplateSelectionModal';
import {
  candidatesApi,
  type ProductBasics,
  type ProductPreparationSelection,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import {
  channelListingsApi,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { getInlineGenerationProgressLabel } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/generation-progress-label';
import ProductPreparationDraftDialog from './ProductPreparationDraftDialog';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  status?: SourcingCandidateStatus;
  productPreparation?: ProductPreparationSelection | null;
  isEditComplete: boolean;
  isLocked: boolean;
  basicInfo?: ProductBasics | null;
  costCny?: number | null;
  selectedThumbnailUrl?: string | null;
  selectedThumbnailGenerationCandidateId?: string | null;
  selectedDetailPageGenerationId?: string | null;
  detailGenerationContentWorkspaceId?: string | null;
  detailGenerationEnabled?: boolean;
  showCandidateActions?: boolean;
  onOpenDetailTemplateGeneration?: () => void;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onBack: () => void;
  rawData?: Record<string, unknown> | null;
  imageUrls?: string[];
}

export default function ProductEditHeader({
  productName,
  productId,
  status = 'sourced',
  productPreparation = null,
  basicInfo = null,
  selectedThumbnailUrl = null,
  selectedThumbnailGenerationCandidateId = null,
  selectedDetailPageGenerationId = null,
  detailGenerationContentWorkspaceId = null,
  detailGenerationEnabled = true,
  showCandidateActions = true,
  onOpenDetailTemplateGeneration,
  onBack,
  rawData = null,
  imageUrls = [],
}: ProductEditHeaderProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [preparationDialogOpen, setPreparationDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectInputOpen, setRejectInputOpen] = useState(false);
  const { mutate: runGenerate, isPending } = useGenerateDetailPage(productId);
  const kp = useKidsPlayfulFromSourcing();
  const kpInProgress = useKidsPlayfulInProgress(productId, {
    enabled: detailGenerationEnabled && !onOpenDetailTemplateGeneration,
    sourceCandidateId: detailGenerationContentWorkspaceId ? null : productId,
    contentWorkspaceId: detailGenerationContentWorkspaceId,
  });
  const generateBusy = isPending || kp.isPending || !!kpInProgress;
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => channelListingsApi.listAccounts(),
    enabled: preparationDialogOpen,
  });

  const createPreparationDraftMutation = useMutation({
    mutationFn: (channelAccountId: string) =>
      candidatesApi.createPreparationDraft(productId, {
        channelAccountId,
        displayName: productName,
        registrationInput: preparationRegistrationInput(productName, basicInfo),
        selectedThumbnailUrl,
        selectedThumbnailGenerationCandidateId,
        selectedDetailPageGenerationId,
        selectedDetailPageArtifactId: basicInfo?.selectedDetailPageArtifactId ?? null,
        selectedDetailPageRevisionId: basicInfo?.selectedDetailPageRevisionId ?? null,
      }),
    onSuccess: (data) => {
      setPreparationDialogOpen(false);
      toast.success('제품 등록 준비를 저장했습니다.', {
        description: `준비 ID: ${data.preparationId}`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '제품 등록 준비를 저장하지 못했습니다.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string | undefined) =>
      candidatesApi.reject(productId, reason && reason.trim() ? reason.trim() : undefined),
    onSuccess: () => {
      toast.success('소싱 후보를 반려했습니다.');
      setRejectInputOpen(false);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '반려 처리에 실패했습니다.');
    },
  });
  const handleConfirm = (templateId: string, mode: GenerateMode) => {
    if (templateId === 'kids-playful' || templateId === 'bold-vertical') {
      kp.trigger({
        sourceCandidateId: productId,
        productId: null,
        contentWorkspaceId: detailGenerationContentWorkspaceId,
        productName,
        rawData,
        templateId: templateId as DetailPageTemplateId,
        generationMode: templateId === 'kids-playful' ? 'full' : mode,
        imageUrls,
      });
      return;
    }
    runGenerate({ mode, templateId });
  };

  const accountScopedPreparation = productPreparation?.channelAccountId ? productPreparation : null;
  const preparationStatus = accountScopedPreparation?.status ??
    createPreparationDraftMutation.data?.status ?? null;
  const preparationId = accountScopedPreparation?.id ??
    createPreparationDraftMutation.data?.preparationId ?? null;
  const canCreatePreparation = status === 'sourced' &&
    (preparationStatus === null || preparationStatus === 'cancelled') &&
    !createPreparationDraftMutation.isPending &&
    !rejectMutation.isPending;
  const canReject = status === 'sourced' && preparationStatus === null &&
    !createPreparationDraftMutation.isPending && !rejectMutation.isPending;
  const hasRegistrationThumbnail = !!selectedThumbnailUrl;
  const hasRegistrationDetailPage = !!selectedDetailPageGenerationId;
  const registrationAssetsTitle = [
    hasRegistrationThumbnail
      ? '등록 대표 썸네일: 사용자가 선택한 이미지'
      : '등록 대표 썸네일: 없음',
    hasRegistrationDetailPage
      ? '등록 상세페이지: 생성 이력에서 선택됨'
      : '등록 상세페이지: 미선택',
  ].join('\n');

  return (
    <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            {productName}
          </h1>
          <p className="text-[10px] text-slate-400 truncate font-mono">
            {productId.slice(0, 8)}
          </p>
          {preparationStatus && preparationStatus !== 'cancelled' && (
            <span
              className={cn(
                'text-[10px] font-bold',
                preparationStatus === 'failed' ? 'text-rose-600' : 'text-emerald-600',
              )}
              title={preparationId ? `제품 등록 준비 ${preparationId}` : undefined}
            >
              {preparationStatusLabel(preparationStatus)}
            </span>
          )}
          {status === 'rejected' && (
            <span className="text-[10px] font-bold text-rose-600">반려됨</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4 text-xs">
        <div
          className="hidden min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 lg:flex"
          title={registrationAssetsTitle}
        >
          {hasRegistrationThumbnail && selectedThumbnailUrl ? (
            <img
              src={selectedThumbnailUrl}
              alt="등록 대표 썸네일"
              className="h-5 w-5 shrink-0 rounded border border-white object-cover shadow-sm"
            />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
              <ImageIcon size={12} />
            </span>
          )}
          <span className="min-w-0 truncate">
            등록 썸네일
          </span>
          <span className="text-slate-300">·</span>
          <FileText
            size={12}
            className={cn(
              'shrink-0',
              hasRegistrationDetailPage ? 'text-emerald-600' : 'text-slate-300',
            )}
          />
          <span
            className={cn(
              'shrink-0',
              hasRegistrationDetailPage ? 'text-emerald-700' : 'text-slate-400',
            )}
          >
            {hasRegistrationDetailPage ? '상세 선택' : '상세 미선택'}
          </span>
        </div>

        {kpInProgress && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            <Loader2 size={11} className="animate-spin" />
            {(() => {
              const label =
                kpInProgress.templateId === 'bold-vertical'
                  ? 'KIDITEM DESIGN'
                  : '트렌드 광고형 템플릿';
              return getInlineGenerationProgressLabel({
                templateLabel: label,
                imageProcessingStatus: kpInProgress.imageProcessingStatus,
                rawInput: kpInProgress.rawInput,
              });
            })()}
          </span>
        )}

        {detailGenerationEnabled && (
          <>
            <button
              type="button"
              onClick={() => {
                if (onOpenDetailTemplateGeneration) {
                  onOpenDetailTemplateGeneration();
                  return;
                }
                setModalOpen(true);
              }}
              disabled={!onOpenDetailTemplateGeneration && generateBusy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
                generateBusy ? 'cursor-wait bg-violet-400' : 'bg-violet-600 hover:bg-violet-700',
              )}
              title="템플릿 + 모드 선택 후 생성"
            >
              {generateBusy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {generateBusy ? '생성 중...' : '상세페이지 생성'}
            </button>
            {!onOpenDetailTemplateGeneration && (
              <TemplateSelectionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onConfirm={handleConfirm}
              />
            )}
          </>
        )}

        {showCandidateActions && status === 'sourced' && (
          <>
            {(preparationStatus === null || preparationStatus === 'cancelled') && (
              <button
                type="button"
                onClick={() => setPreparationDialogOpen(true)}
                disabled={!canCreatePreparation}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
                  canCreatePreparation
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'cursor-not-allowed bg-emerald-300',
                )}
                title={`채널별 제품 등록 준비\n${registrationAssetsTitle}`}
              >
                {createPreparationDraftMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                제품 등록 준비
              </button>
            )}
            {preparationStatus === null && (
              <button
                type="button"
                onClick={() => setRejectInputOpen((v) => !v)}
                disabled={!canReject}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                  canReject
                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                    : 'cursor-not-allowed border-rose-100 text-rose-300',
                )}
                title="후보 반려"
              >
                <XCircle size={12} />
                반려
              </button>
            )}
            {preparationStatus === null && rejectInputOpen && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="반려 사유 (선택)"
                  className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-300"
                />
                <button
                  type="button"
                  onClick={() => rejectMutation.mutate(rejectReason)}
                  disabled={rejectMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} />
                  )}
                  확인
                </button>
              </div>
            )}
          </>
        )}

        <ProductPreparationDraftDialog
          open={preparationDialogOpen}
          accounts={accountsQuery.data ?? []}
          isLoading={accountsQuery.isLoading}
          isSubmitting={createPreparationDraftMutation.isPending}
          errorMessage={accountsQuery.error
            ? isApiError(accountsQuery.error)
              ? accountsQuery.error.detail
              : '채널 계정을 불러오지 못했습니다.'
            : null}
          onClose={() => setPreparationDialogOpen(false)}
          onSubmit={(channelAccountId) => createPreparationDraftMutation.mutate(channelAccountId)}
        />
      </div>
    </div>
  );
}

function preparationRegistrationInput(
  productName: string,
  basicInfo: ProductBasics | null,
): Record<string, unknown> {
  if (!basicInfo) return { name: productName };
  const {
    selectedThumbnailUrl: _selectedThumbnailUrl,
    selectedThumbnailGenerationCandidateId: _selectedThumbnailGenerationCandidateId,
    selectedDetailPageGenerationId: _selectedDetailPageGenerationId,
    selectedDetailPageArtifactId: _selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: _selectedDetailPageRevisionId,
    thumbnailPreviewUrls: _thumbnailPreviewUrls,
    ...registrationInput
  } = basicInfo;
  return { ...registrationInput, name: productName };
}

function preparationStatusLabel(status: ProductPreparationSelection['status']): string {
  switch (status) {
    case 'draft':
      return '등록 준비됨';
    case 'submitting':
      return '마켓 등록 중';
    case 'registered':
      return '제품 등록됨';
    case 'failed':
      return '등록 실패';
    case 'cancelled':
      return '등록 취소됨';
  }
}
