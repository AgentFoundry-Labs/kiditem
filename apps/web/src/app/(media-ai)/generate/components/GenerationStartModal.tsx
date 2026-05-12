'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import type { GenerationDialogState } from '../hooks/useGenerateForm';

interface GenerationStartModalProps {
  state: GenerationDialogState | null;
  onClose: () => void;
  onAction?: () => void;
}

const TEMPLATE_LABEL: Record<string, string> = {
  'bold-vertical': 'KIDITEM DESIGN',
  'kids-playful': 'Trend Vertical',
};

export default function GenerationStartModal({ state, onClose, onAction }: GenerationStartModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !state?.open) return null;

  const isStarted = state.phase === 'started';
  const isSubmitting = state.phase === 'submitting';
  const isCompleted = state.phase === 'completed';
  const isFailed = state.phase === 'failed';
  const isCancelled = state.phase === 'cancelled';
  const isInProgress = isSubmitting || isStarted;
  const templateLabel = TEMPLATE_LABEL[state.templateId] ?? state.templateId;
  const titleText = getTitleText(state);
  const descriptionText = getDescriptionText(state);
  const progressLabel = getProgressLabel(state);
  const actionLabel = getActionLabel(state);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-start-modal-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-[var(--primary)]" />
            <h2
              id="generation-start-modal-title"
              className="text-sm font-black text-[var(--text-primary)]"
            >
              상세페이지 생성
            </h2>
          </div>
          {!isSubmitting && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              aria-label="닫기"
            >
              <X size={17} />
            </button>
          )}
        </div>

        <div className="px-6 py-7 text-center">
          <div
            className={cn(
              'mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full',
              isCompleted && 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
              isFailed && 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
              isCancelled &&
                'bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ring-1 ring-[var(--border)]',
              isInProgress && 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
            )}
          >
            {isCompleted ? (
              <CheckCircle2 size={29} />
            ) : isFailed || isCancelled ? (
              <AlertCircle size={28} />
            ) : (
              <Loader2 size={28} className="animate-spin" />
            )}
          </div>

          <p className="text-lg font-black text-[var(--text-primary)]">
            {titleText}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            {descriptionText}
          </p>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-[var(--text-tertiary)]">템플릿</span>
              <span className="text-xs font-black text-[var(--primary)]">{templateLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-[var(--text-tertiary)]">상품명</span>
              <span className="min-w-0 truncate text-right text-xs font-bold text-[var(--text-primary)]">
                {state.productName}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-[var(--text-tertiary)]">시작</span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {formatTime(state.startedAt, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {state.errorMessage && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-left text-xs font-bold leading-5 text-rose-700">
              {state.errorMessage}
            </p>
          )}

          <div
            className={cn(
              'mt-5 h-2 overflow-hidden rounded-full',
              isCompleted ? 'bg-emerald-100' : 'bg-violet-100',
            )}
          >
            <div
              className={cn(
                'h-full rounded-full',
                isCompleted && 'w-full bg-emerald-500',
                isFailed && 'w-full bg-rose-400',
                isCancelled && 'w-full bg-[var(--text-tertiary)]',
                isStarted && 'w-2/3 animate-pulse bg-violet-500',
                isSubmitting && 'w-1/3 animate-pulse bg-violet-500',
              )}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--text-tertiary)]">
            {progressLabel}
          </p>

          {!isSubmitting && (
            <button
              type="button"
              onClick={onAction ?? onClose}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-neutral-950 px-6 text-sm font-bold text-white transition hover:bg-neutral-800"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function getTitleText(state: GenerationDialogState): string {
  if (state.phase === 'completed') return '생성 완료';
  if (state.phase === 'failed') return '생성 실패';
  if (state.phase === 'cancelled') return '생성 중단됨';
  if (state.phase === 'started') return '생성 중입니다';
  return '요청 등록 중입니다';
}

function getDescriptionText(state: GenerationDialogState): string {
  if (state.phase === 'completed') return '상세페이지가 완성되었습니다.';
  if (state.phase === 'failed') return '상세페이지 생성이 완료되지 못했습니다.';
  if (state.phase === 'cancelled') return '요청한 상세페이지 생성이 중단되었습니다.';
  if (state.phase === 'started') return '백그라운드에서 상세페이지를 만들고 있습니다.';
  return '상품 정보와 이미지를 정리해 생성 요청을 등록하고 있습니다.';
}

function getProgressLabel(state: GenerationDialogState): string {
  if (state.phase === 'completed') return '완료';
  if (state.phase === 'failed') return '실패';
  if (state.phase === 'cancelled') return '중단됨';
  if (state.phase === 'started') return 'AI 생성 진행 중';
  return '요청 등록 중';
}

function getActionLabel(state: GenerationDialogState): string {
  if (state.phase === 'completed' && state.editorUrl) return '상세페이지로 이동';
  if (state.phase === 'failed' || state.phase === 'cancelled') return '닫기';
  return '목록에서 확인';
}
