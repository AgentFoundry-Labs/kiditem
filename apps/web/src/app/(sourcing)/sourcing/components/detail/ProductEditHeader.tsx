'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useKidsPlayfulInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import {
  candidatesApi,
  type PromoteCandidateResponse,
} from '../../lib/sourcing-api';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  /** Current candidate status (Phase 7, #192). Drives promote/reject visibility. */
  status?: SourcingCandidateStatus;
  /** Master id after promotion — links to catalog when present. */
  promotedMasterId?: string | null;
  isEditComplete: boolean;
  isLocked: boolean;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onBack: () => void;
}

export default function ProductEditHeader({
  productName,
  productId,
  status = 'sourced',
  promotedMasterId = null,
  isEditComplete,
  isLocked,
  onToggleEditComplete,
  onToggleLocked,
  onBack,
}: ProductEditHeaderProps) {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectInputOpen, setRejectInputOpen] = useState(false);

  // Live progress badge: KP/Bold generation may be running against the
  // promoted master (post-promotion auto-fire from sourcing → ai). When the
  // candidate is still `sourced`, fall back to the candidate id so the badge
  // continues to surface anything keyed there by older flows.
  const trackingId = promotedMasterId ?? productId;
  const kpInProgress = useKidsPlayfulInProgress(trackingId);

  const promoteMutation = useMutation({
    mutationFn: () =>
      candidatesApi.promote(productId, {
        // Minimal promote: a single default option until the user wires
        // option editing for sourcing candidates. The server requires at
        // least one option payload per the Phase 3 DTO.
        options: [{ optionName: '기본' }],
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

  const canPromote = status === 'sourced' && !promoteMutation.isPending && !rejectMutation.isPending;
  const canReject = status === 'sourced' && !promoteMutation.isPending && !rejectMutation.isPending;

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
        {kpInProgress && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            <Loader2 size={11} className="animate-spin" />
            {(() => {
              const label =
                kpInProgress.templateId === 'bold-vertical'
                  ? 'KIDITEM DESIGN'
                  : 'Trend Vertical';
              return kpInProgress.imageProcessingStatus === 'pending'
                ? `${label} 카피 생성 중...`
                : `${label} 이미지 생성 중...`;
            })()}
          </span>
        )}

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
              title="제품으로 등록 (Master 생성 + AI 자동 생성 트리거)"
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
