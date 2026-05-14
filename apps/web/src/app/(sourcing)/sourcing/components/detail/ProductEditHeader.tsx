'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useKidsPlayfulInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { useGenerateDetailPage, type GenerateMode } from '../../[id]/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../[id]/hooks/useKidsPlayfulFromSourcing';
import TemplateSelectionModal from '../../[id]/components/TemplateSelectionModal';
import {
  candidatesApi,
  type PromoteCandidateResponse,
} from '../../lib/sourcing-api';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  status?: SourcingCandidateStatus;
  promotedMasterId?: string | null;
  isEditComplete: boolean;
  isLocked: boolean;
  selectedThumbnailUrl?: string | null;
  selectedThumbnailGenerationCandidateId?: string | null;
  selectedDetailPageGenerationId?: string | null;
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
  promotedMasterId = null,
  isEditComplete,
  isLocked,
  selectedThumbnailUrl = null,
  selectedThumbnailGenerationCandidateId = null,
  selectedDetailPageGenerationId = null,
  onToggleEditComplete,
  onToggleLocked,
  onBack,
  rawData = null,
  imageUrls = [],
}: ProductEditHeaderProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectInputOpen, setRejectInputOpen] = useState(false);
  const { mutate: runGenerate, isPending } = useGenerateDetailPage(promotedMasterId ?? productId);
  const kp = useKidsPlayfulFromSourcing();
  const trackingId = promotedMasterId ?? productId;
  const kpInProgress = useKidsPlayfulInProgress(trackingId);
  const generateBusy = isPending || kp.isPending || !!kpInProgress;

  const promoteMutation = useMutation({
    mutationFn: () =>
      candidatesApi.promote(productId, {
        options: [{ optionName: '기본' }],
        selectedThumbnailUrl,
        selectedThumbnailGenerationCandidateId,
        selectedDetailPageGenerationId,
      }),
    onSuccess: (data: PromoteCandidateResponse) => {
      toast.success('마스터로 등록 완료 — 자동 AI 생성 큐 진입');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      if (data?.masterId) {
        queryClient.invalidateQueries({ queryKey: ['edited-html', data.masterId] });
      }
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '제품 등록에 실패했습니다.');
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
        productId: promotedMasterId,
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

  const canPromote = status === 'sourced' && !promoteMutation.isPending && !rejectMutation.isPending;
  const canReject = status === 'sourced' && !promoteMutation.isPending && !rejectMutation.isPending;
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
          {status === 'promoted' && (
            <span className="text-[10px] font-bold text-emerald-600">제품 등록됨</span>
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
              return kpInProgress.imageProcessingStatus === 'pending'
                ? `${label} 카피 생성 중...`
                : `${label} 이미지 생성 중...`;
            })()}
          </span>
        )}

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={generateBusy}
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
        <TemplateSelectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
        />

        {status === 'sourced' && (
          <>
            <button
              type="button"
              onClick={() => promoteMutation.mutate()}
              disabled={!canPromote}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
                canPromote
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'cursor-not-allowed bg-emerald-300',
              )}
              title={`제품으로 등록\n${registrationAssetsTitle}`}
            >
              {promoteMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              {promoteMutation.isPending ? '등록 중...' : '제품 등록'}
            </button>
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
            {rejectInputOpen && (
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

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isEditComplete ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-slate-400')}
          >
            {isEditComplete && (
              <Check size={10} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isEditComplete}
            onChange={onToggleEditComplete}
            className="sr-only"
          />
          <span className="text-slate-600 whitespace-nowrap">편집완료</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isLocked ? 'bg-amber-500 border-amber-500' : 'border-slate-300 group-hover:border-slate-400')}
          >
            {isLocked && (
              <Lock size={9} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isLocked}
            onChange={onToggleLocked}
            className="sr-only"
          />
          <span className="text-slate-600 whitespace-nowrap">상품잠금</span>
        </label>
      </div>
    </div>
  );
}
