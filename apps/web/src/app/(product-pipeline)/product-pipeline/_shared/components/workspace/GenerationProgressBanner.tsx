'use client';

/**
 * 상세페이지 생성 진행 배너 — 썸네일 AI 의 BatchProgressBanner 와 같은 스타일.
 *
 * 단일 entry: 풀 사이즈 배너.
 * 다중 entry: GenerationProgressBannerStack 으로 묶어서 헤더 한 줄 + 컴팩트 행 N개로 렌더.
 */

import { useState } from 'react';
import { Loader2, Square } from 'lucide-react';
import { toast } from 'sonner';
import {
  getDetailGenerationMode,
  getDetailGenerationStage,
  type DetailGenerationMode,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/generation-progress-label';
import { isApiError } from '@/lib/api-error';

export interface GenerationEntry {
  /** entry 식별자 — React key */
  id: string;
  /** 'kids-playful' | 'bold-vertical' | ... */
  templateId: string;
  /** 'pending' | 'processing' | 'completed' | 'failed' */
  status: string;
  /** processedImages 채워진 갯수 */
  processedCount?: number;
  /** 총 raw 이미지 갯수 */
  totalCount?: number;
  /** 어떤 상품인지 */
  productName?: string;
  /** detail-page generationMode. rawInput 에서 온다. */
  generationMode?: DetailGenerationMode;
}

interface GenerationProgressBannerProps extends GenerationEntry {
  /** true 면 padding/font 작게 — 다중 entry stack 안에서 사용 */
  compact?: boolean;
  isCancelling?: boolean;
  isConfirmingCancel?: boolean;
  onRequestCancel?: () => void;
  onConfirmCancel?: () => void;
  onDismissCancel?: () => void;
}

const TEMPLATE_LABEL: Record<string, string> = {
  'kids-playful': '트렌드 광고형 템플릿',
  'bold-vertical': 'KIDITEM DESIGN',
};

export function GenerationProgressBanner({
  templateId,
  status,
  processedCount = 0,
  totalCount = 0,
  productName,
  generationMode = 'full',
  compact = false,
  isCancelling = false,
  isConfirmingCancel = false,
  onRequestCancel,
  onConfirmCancel,
  onDismissCancel,
}: GenerationProgressBannerProps) {
  const tLabel = TEMPLATE_LABEL[templateId] ?? templateId;
  const isProcessing = status === 'processing';

  const stage = getDetailGenerationStage(status, generationMode);
  const pct =
    isProcessing && totalCount > 0
      ? Math.min(100, Math.round((processedCount / totalCount) * 100))
      : null;

  const padCls = compact ? 'px-4 py-2.5' : 'px-5 py-4';
  const titleCls = compact ? 'text-[13px] font-bold' : 'text-[15px] font-bold';
  const barH = compact ? 'h-1.5' : 'h-2';
  const subCls = compact ? 'text-[11px]' : 'text-[12px]';
  const spaceY = compact ? 'space-y-1' : 'space-y-2';

  return (
    <div
      className={`${padCls} rounded-xl flex items-center gap-3`}
      style={{ background: '#7c3aed18', border: '2px solid #7c3aed40' }}
    >
      <Loader2
        size={compact ? 16 : 20}
        className="animate-spin flex-shrink-0"
        style={{ color: '#7c3aed' }}
      />
      <div className={`flex-1 min-w-0 ${spaceY}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={`${titleCls} truncate`} style={{ color: '#7c3aed' }}>
            {productName ? `${productName} — ` : ''}{tLabel} 상세페이지 생성 중 · {stage}
          </span>
          <InlineCancelAction
            compact={compact}
            isLoading={isCancelling}
            isConfirming={isConfirmingCancel}
            onRequest={onRequestCancel}
          />
        </div>
        <div className={`${barH} rounded-full overflow-hidden`} style={{ background: '#7c3aed20' }}>
          {pct !== null ? (
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: '#7c3aed' }}
            />
          ) : (
            <div
              className="h-full rounded-full"
              style={{
                width: '40%',
                background: '#7c3aed',
                animation: 'kiditem-progress-indeterminate 1.4s ease-in-out infinite',
              }}
            />
          )}
        </div>
        {!compact && (
          <div className={subCls} style={{ color: '#7c3aed90' }}>
            {isProcessing && totalCount > 0
              ? `이미지 ${processedCount} / ${totalCount}개 처리됨`
              : '잠시만 기다려주세요 — 다른 페이지로 이동해도 백그라운드에서 계속 진행됩니다'}
          </div>
        )}
        {isConfirmingCancel && (
          <InlineCancelPrompt
            compact={compact}
            isLoading={isCancelling}
            onConfirm={onConfirmCancel}
            onDismiss={onDismissCancel}
          />
        )}
      </div>

      <style jsx>{`
        @keyframes kiditem-progress-indeterminate {
          0% { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

/**
 * 여러 건 동시 진행 시 사용 — 헤더(N건) + 각 entry 의 compact row.
 * entries.length === 0 이면 null. 1개여도 stack 으로 감싸서 일관성 유지 (단, padding 풀 사이즈).
 */
export function GenerationProgressBannerStack({
  entries,
  onCancel,
}: {
  entries: Array<GenerationEntry & { rawInput?: unknown }>;
  onCancel?: (entry: GenerationEntry) => Promise<unknown> | unknown;
}) {
  const [cancelTarget, setCancelTarget] = useState<(GenerationEntry & { rawInput?: unknown }) | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  if (entries.length === 0) return null;

  const confirmCancel = async () => {
    if (!cancelTarget || !onCancel || isCancelling) return;
    setIsCancelling(true);
    try {
      await onCancel(cancelTarget);
      toast.success('상세페이지 생성 중단 요청을 보냈습니다');
      setCancelTarget(null);
    } catch (error) {
      toast.error(isApiError(error) ? error.detail : '상세페이지 생성 중단 요청에 실패했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  // 1건이면 풀 사이즈 단일 배너 (기존 UX 유지)
  if (entries.length === 1) {
    const e = entries[0];
    return (
      <>
        <div className="mx-4 my-3">
          <GenerationProgressBanner
            {...e}
            generationMode={e.generationMode ?? getDetailGenerationMode(e.rawInput)}
            isCancelling={isCancelling && cancelTarget?.id === e.id}
            isConfirmingCancel={cancelTarget?.id === e.id}
            onRequestCancel={onCancel ? () => setCancelTarget(e) : undefined}
            onConfirmCancel={confirmCancel}
            onDismissCancel={() => setCancelTarget(null)}
          />
        </div>
      </>
    );
  }

  // 다건 — 헤더 + compact rows
  return (
    <>
      <div
        className="mx-4 my-3 rounded-2xl px-4 py-3 space-y-2"
        style={{ background: '#7c3aed10', border: '2px solid #7c3aed40' }}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[14px] font-bold" style={{ color: '#7c3aed' }}>
            상세페이지 {entries.length}건 생성 중
          </span>
          <span className="text-[11px]" style={{ color: '#7c3aed90' }}>
            백그라운드에서 동시 진행 — 다른 페이지로 이동 가능
          </span>
        </div>
        <div className="space-y-1.5">
          {entries.map((e) => (
            <GenerationProgressBanner
              key={e.id}
              {...e}
              generationMode={e.generationMode ?? getDetailGenerationMode(e.rawInput)}
              compact
              isCancelling={isCancelling && cancelTarget?.id === e.id}
              isConfirmingCancel={cancelTarget?.id === e.id}
              onRequestCancel={onCancel ? () => setCancelTarget(e) : undefined}
              onConfirmCancel={confirmCancel}
              onDismissCancel={() => setCancelTarget(null)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function InlineCancelAction({
  compact,
  isLoading,
  isConfirming,
  onRequest,
}: {
  compact: boolean;
  isLoading: boolean;
  isConfirming: boolean;
  onRequest?: () => void;
}) {
  if (!onRequest) return null;
  if (isConfirming) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onRequest();
      }}
      disabled={isLoading}
      aria-label="상세페이지 생성 중단"
      title="상세페이지 생성 중단"
      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white/80 px-2 py-1 text-[11px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
    >
      {isLoading ? (
        <Loader2 size={compact ? 12 : 13} className="animate-spin" />
      ) : (
        <Square size={compact ? 12 : 13} />
      )}
      {!compact && <span>중단</span>}
    </button>
  );
}

function InlineCancelPrompt({
  compact,
  isLoading,
  onConfirm,
  onDismiss,
}: {
  compact: boolean;
  isLoading: boolean;
  onConfirm?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white/85 px-3 py-2 shadow-sm"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="min-w-0">
        <div className="truncate text-[12px] font-bold text-rose-700">
          {compact ? '중단할까요?' : '상세페이지 생성을 중단할까요?'}
        </div>
        {!compact && (
          <div className="mt-0.5 text-[11px] font-medium text-rose-500">
            이미 완료된 결과는 유지됩니다.
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="계속 실행"
          onClick={onDismiss}
          disabled={isLoading}
          className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
        >
          계속
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading && <Loader2 size={11} className="animate-spin" />}
          중단
        </button>
      </div>
    </div>
  );
}
