'use client';

/**
 * 상세페이지 생성 진행 배너 — 썸네일 AI 의 BatchProgressBanner 와 같은 스타일.
 *
 * 단일 entry: 풀 사이즈 배너.
 * 다중 entry: GenerationProgressBannerStack 으로 묶어서 헤더 한 줄 + 컴팩트 행 N개로 렌더.
 */

import { Loader2 } from 'lucide-react';

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
}

interface GenerationProgressBannerProps extends GenerationEntry {
  /** true 면 padding/font 작게 — 다중 entry stack 안에서 사용 */
  compact?: boolean;
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
  compact = false,
}: GenerationProgressBannerProps) {
  const tLabel = TEMPLATE_LABEL[templateId] ?? templateId;
  const isPending = status === 'pending';
  const isProcessing = status === 'processing';

  // pending 단계: 카피 (LLM JSON) 생성 중 — 진행률 indeterminate
  // processing 단계: 누끼/배경합성 — processedCount/totalCount 로 진행률
  const stage = isPending ? 'AI 카피 생성 중' : isProcessing ? 'AI 이미지 합성 중' : '완료 처리 중';
  const pct =
    isProcessing && totalCount > 0
      ? Math.min(100, Math.round((processedCount / totalCount) * 100))
      : null;

  const padCls = compact ? 'px-4 py-2.5' : 'px-5 py-4';
  const titleCls = compact ? 'text-[13px] font-bold' : 'text-[15px] font-bold';
  const pctCls = compact ? 'text-[12px] font-black tabular-nums' : 'text-[14px] font-black tabular-nums';
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
          {pct !== null && (
            <span className={pctCls} style={{ color: '#7c3aed' }}>
              {pct}%
            </span>
          )}
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
}: {
  entries: GenerationEntry[];
}) {
  if (entries.length === 0) return null;

  // 1건이면 풀 사이즈 단일 배너 (기존 UX 유지)
  if (entries.length === 1) {
    const e = entries[0];
    return (
      <div className="mx-4 my-3">
        <GenerationProgressBanner {...e} />
      </div>
    );
  }

  // 다건 — 헤더 + compact rows
  return (
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
          <GenerationProgressBanner key={e.id} {...e} compact />
        ))}
      </div>
    </div>
  );
}
